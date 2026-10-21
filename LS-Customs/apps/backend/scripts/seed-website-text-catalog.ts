import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import ts from 'typescript'
const catalogPath='apps/web/src/data/websiteTextCatalog.json'
const entries=JSON.parse(readFileSync(catalogPath,'utf8'))
const add=(section:string,default_text:string,label=default_text)=>{
 const key='copy.'+createHash('sha256').update(section+'\0'+default_text).digest('hex').slice(0,24)
 const existing=entries.find((r:{key:string})=>r.key===key)
 if(existing) { if(label!==default_text)existing.label=label; return }
 entries.push({key,section,label:label.slice(0,85),default_text})
}
if(existsSync('apps/web/src/data/websiteTextAdditional.json')) for(const row of JSON.parse(readFileSync('apps/web/src/data/websiteTextAdditional.json','utf8'))) add(row.section,row.default_text,row.label)
const source=ts.createSourceFile('settings.ts',readFileSync('apps/web/src/hooks/useCustomerSiteSettings.ts','utf8'),ts.ScriptTarget.Latest,true)
const footerFields=['companyName','supportPhone','supportEmail','address','workingHours']
const workspaceFields=['bannerText','bannerLinkText','promoTitle','welcomeSubtitle','heroEyebrow','heroHeadline','heroHeadlineEm','heroSubtitle','heroCtaRentalText','heroCtaServiceText']
const settings:{section:string;default_text:string;field:string}[]=[]
function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='DEFAULT_SITE_SETTINGS'&&node.initializer&&ts.isObjectLiteralExpression(node.initializer))for(const prop of node.initializer.properties){if(!ts.isPropertyAssignment(prop)||!ts.isStringLiteral(prop.initializer))continue;const field=prop.name.getText(source);if(![...footerFields,...workspaceFields].includes(field))continue;const section=footerFields.includes(field)?'Footer':'Workspace',default_text=prop.initializer.text;settings.push({section,default_text,field});add(section,default_text,field.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()))}ts.forEachChild(node,visit)}visit(source)
entries.sort((a:{section:string;key:string},b:{section:string;key:string})=>a.section.localeCompare(b.section)||a.key.localeCompare(b.key))
for(const entry of entries) { const expected='copy.'+createHash('sha256').update(entry.section+'\0'+entry.default_text).digest('hex').slice(0,24); if(entry.key!==expected) throw new Error('Catalog text encoding or stable key mismatch: '+entry.key) }
const json=JSON.stringify(entries), settingsJson=JSON.stringify(settings)
if(json.includes('$website_catalog$')||settingsJson.includes('$site_fields$'))throw new Error('SQL delimiter appears in text')
writeFileSync(catalogPath,JSON.stringify(entries,null,2)+'\n')
writeFileSync('apps/backend/supabase/migrations/20261021111000_website_text_catalog.sql',`-- Customer interface text catalog. Existing overrides are retained on replay.\ninsert into public.website_text(key,section,label,default_text)\nselect key,section,label,default_text from jsonb_to_recordset($website_catalog$${json}$website_catalog$::jsonb) as entry(key text,section text,label text,default_text text)\non conflict(key) do nothing;\n\n-- Preserve the currently displayed banner/business wording from existing settings.\nupdate public.website_text as copy set value = settings.settings->>field.field\nfrom public.customer_site_settings settings,\njsonb_to_recordset($site_fields$${settingsJson}$site_fields$::jsonb) as field(section text,default_text text,field text)\nwhere settings.id=1 and copy.section=field.section and copy.default_text=field.default_text\n  and copy.value is null and jsonb_typeof(settings.settings->field.field)='string'\n  and settings.settings->>field.field <> copy.default_text;\n`)
console.log(`Catalog: ${entries.length} entries in ${new Set(entries.map((r:{section:string})=>r.section)).size} sections`)
