/**
 * Vehicle catalog data.
 * In production this would come from Supabase, but for the MVP
 * we keep a curated demo fleet as static data.
 */
import type { Vehicle } from '../types'

export const vehicles: Vehicle[] = [
  { name: 'Audi A4 Premium', detail: 'Executive sedan · 5 seats · Automatic', price: '₱4,500', image: 'https://images.unsplash.com/photo-1606664515524-ed2f786666', tag: 'EXECUTIVE', rating: '4.9' },
  { name: 'Mercedes-Benz C-Class', detail: 'Luxury grand tourer · 5 seats · Automatic', price: '₱12,000', image: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8', tag: 'LUXURY', rating: '4.8' },
  { name: 'Pfister Neon', detail: 'Premium electric performance · 2 seats', price: '₱410', image: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7', tag: 'ELECTRIC SUV', rating: '5.0' },
  { name: 'Gallivanter Baller', detail: 'All-wheel drive SUV · 5 seats · Automatic', price: '₱3,800', image: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b', tag: 'PREMIUM SUV', rating: '4.8' },
  { name: 'Enus Deity', detail: 'Executive sedan · 4 seats · Automatic', price: '₱6,200', image: 'https://images.unsplash.com/photo-1555215695-3004980ad54e', tag: 'EXECUTIVE', rating: '4.7' },
  { name: 'Ocelot Pariah', detail: 'High-performance exotic · 2 seats · Automatic', price: '₱8,500', image: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a', tag: 'SPORTS', rating: '4.7' },
  { name: 'Grotti Itali RSX', detail: 'Luxury sports coupe · 2 seats · Automatic', price: '₱9,800', image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70', tag: 'EXOTIC', rating: '4.9' },
  { name: 'Schafter V12', detail: 'Long-wheelbase sedan · 5 seats · Automatic', price: '₱5,400', image: 'https://images.unsplash.com/photo-1553440569-bcc63803a83d', tag: 'GRAND TOURER', rating: '4.6' },
  { name: 'Enus Paragon R', detail: 'Luxury grand tourer · 4 seats · Automatic', price: '₱7,600', image: 'https://images.unsplash.com/photo-1563720223185-11003d516935', tag: 'LUXURY', rating: '4.8' },
]
