"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, ChevronDown, Menu, Search, ShoppingBag, UserRound, X, ArrowRight } from "lucide-react";
import { useCart } from "@/components/ecommarce/CartContext";

export type MenuProduct = { id: number; slug: string; name: string; image: string | null };
type MenuName = "Clothing" | "Shoes" | "Accessories" | "Gifts";
const collection = (slug: string) => `/ecommerce/products?category=${slug}`;
const menus: Record<MenuName, { title: string; links: Array<[string, string]>; image: string; headline: string; cta: string; href: string }> = {
  Clothing: { title: "CLOTHING", links: [["Suits", "suits"], ["Jackets", "jackets"], ["Trousers", "trousers"], ["Knitwear", "knitwear"], ["Classic Shirts", "classic-shirts"], ["Casual Shirts", "casual-shirts"], ["Outerwear", "outerwear"], ["Waistcoats", "waistcoats"]], image: "/editorial/suits.webp", headline: "Tailoring, Reimagined", cta: "Explore suits", href: collection("suits") },
  Shoes: { title: "FOOTWEAR", links: [["Loafers", "shoes"], ["Classic Shoes", "shoes"], ["Leather Essentials", "shoes"]], image: "/editorial/shoes.webp", headline: "The Finishing Touch", cta: "Discover shoes", href: collection("shoes") },
  Accessories: { title: "ACCESSORIES", links: [["Ties", "ties"], ["Pocket Squares", "pocket-squares"], ["Socks", "socks"], ["Leather Goods", "leather-goods"], ["Sunglasses", "sunglasses"], ["Cufflinks", "cufflinks"]], image: "/editorial/accessories.webp", headline: "Small Details. Lasting Style.", cta: "Explore accessories", href: collection("accessories") },
  Gifts: { title: "THE GIFT EDIT", links: [["Thoughtful Details", "accessories"], ["Ties & Pocket Squares", "ties"], ["Everyday Essentials", "knitwear"]], image: "/editorial/knitwear.webp", headline: "Something Considered", cta: "Discover the gift edit", href: collection("accessories") },
};

export function EditorialHeader({ highlights, onOpenBag }: { highlights: MenuProduct[]; onOpenBag: () => void }) {
  const { cartCount } = useCart();
  const [activeMenu, setActiveMenu] = useState<MenuName | null>(null);
  const [displayMenu, setDisplayMenu] = useState<MenuName>("Clothing");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const close = () => { setActiveMenu(null); setMobileOpen(false); setSearchOpen(false); };
  const active = menus[displayMenu];
  const openMenu = (name: MenuName) => { setDisplayMenu(name); setActiveMenu(name); setSearchOpen(false); };
  return <div className="editorial-header-group" onKeyDown={event => { if (event.key === "Escape") close(); }}>
    <div className="editorial-announcement"><Link href="/ecommerce/products?sort=newest">DISCOVER OUR NEW SEASON COLLECTION</Link></div>
    <header className="editorial-header" onMouseLeave={() => setActiveMenu(null)}>
      <button className="editorial-mobile-menu" type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => { setMobileOpen(!mobileOpen); setSearchOpen(false); }}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <nav className="editorial-desktop-nav" aria-label="Main navigation">
        <Link className="editorial-nav-accent" href="/ecommerce/products?sort=newest" onMouseEnter={() => setActiveMenu(null)} onClick={close}>New Arrivals</Link>
        {(Object.keys(menus) as MenuName[]).map(name => <button key={name} type="button" aria-expanded={activeMenu === name} aria-controls="editorial-mega-menu" onMouseEnter={() => openMenu(name)} onClick={() => { if (activeMenu === name) setActiveMenu(null); else openMenu(name); }}>{name}</button>)}
        <Link className="editorial-nav-accent" href="/#our-story" onMouseEnter={() => setActiveMenu(null)} onClick={close}>Our Story</Link>
      </nav>
      <Link href="/" className="editorial-wordmark" aria-label="Aura BOED home" onClick={close}><img src="/AURA_BOED_Logo.svg" alt="Aura BOED" width="118" height="48" /></Link>
      <div className="editorial-header-actions">
        <button type="button" aria-label="Search products" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setActiveMenu(null); setMobileOpen(false); }}><Search size={17} /></button>
        <Link href="/ecommerce/wishlist" aria-label="Wishlist" className="editorial-wishlist-link" onClick={close}><Bookmark size={16} /></Link>
        <span className="editorial-header-divider" aria-hidden="true" />
        <span className="editorial-header-language">EN <ChevronDown size={10} /></span>
        <Link href="/ecommerce/contact" className="editorial-stores-link" onClick={close}>Our stores</Link>
        <Link href="/ecommerce/user" aria-label="My account" onClick={close}><span className="editorial-action-label">Account</span><UserRound className="editorial-action-icon" size={18} /></Link>
        <button type="button" className="editorial-cart-trigger" aria-label={`Shopping bag, ${cartCount} items`} onClick={() => { close(); onOpenBag(); }}><span className="editorial-action-label">Cart</span><ShoppingBag className="editorial-action-icon" size={19} /><span className="editorial-cart-count">{cartCount}</span></button>
      </div>
      <div id="editorial-mega-menu" className="editorial-mega-panel" data-open={Boolean(activeMenu)} inert={!activeMenu} aria-hidden={!activeMenu} aria-label={`${displayMenu} menu`}>
        <div className="editorial-mega-column"><h2>{active.title}</h2>{active.links.map(([label, slug]) => <Link key={label} href={collection(slug)} onClick={close}>{label}</Link>)}<Link href={active.href} onClick={close}>View All</Link></div>
        <div className="editorial-mega-column"><h2>HIGHLIGHTS</h2><Link href="/ecommerce/products?sort=newest" onClick={close}>Latest Styles</Link><Link href={collection("suits")} onClick={close}>The Occasion Edit</Link><Link href="/ecommerce/products?sort=popular" onClick={close}>Best Sellers</Link><Link href="/#our-story" onClick={close}>The Aura BOED Edit</Link></div>
        <div className="editorial-mega-column editorial-mega-products"><h2>BEST-SELLING ESSENTIALS</h2>{highlights.map(product => <Link key={product.id} className="editorial-mega-product" href={`/ecommerce/products/${product.slug}`} onClick={close}><img src={product.image || "/placeholder.svg"} alt={product.name} /><span>{product.name}<strong>Discover now</strong></span></Link>)}</div>
        <Link className="editorial-mega-promo" href={active.href} onClick={close}><img src={active.image} alt="" /><span><strong>{active.headline}</strong><span>{active.cta} <ArrowRight size={16} /></span></span></Link>
      </div>
    </header>
    <button type="button" className="editorial-menu-shade" data-open={Boolean(activeMenu)} tabIndex={activeMenu ? 0 : -1} aria-hidden={!activeMenu} aria-label="Close menu" onClick={close} />
    {searchOpen ? <form action="/ecommerce/products" className="editorial-search" onSubmit={close}><label htmlFor="editorial-search">Find your next favourite</label><div><input autoFocus id="editorial-search" name="q" type="search" placeholder="Search the collection…" required /><button type="submit">Search <Search size={16} /></button><button type="button" aria-label="Close search" onClick={close}><X size={18} /></button></div></form> : null}
    {mobileOpen ? <nav className="editorial-mobile-nav" aria-label="Mobile navigation"><Link href="/ecommerce/products?sort=newest" onClick={close}>New Arrivals</Link>{["Suits", "Jackets", "Shirts", "Trousers", "Knitwear", "Shoes", "Accessories"].map(label => <Link key={label} href={collection(label.toLowerCase())} onClick={close}>{label}</Link>)}<Link href="/#our-story" onClick={close}>Our Story</Link></nav> : null}
  </div>;
}
