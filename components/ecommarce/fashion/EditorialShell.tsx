"use client";

import { useState, type ReactNode } from "react";
import { EditorialBag } from "./EditorialBag";
import { EditorialHeader, type MenuProduct } from "./EditorialHeader";
import { EditorialFooter } from "./EditorialFooter";
import "./editorial.css";

export function EditorialShell({ children, highlights = [], socials = [] }: { children: ReactNode; highlights?: MenuProduct[]; socials?: Array<{ name: string; href: string }> }) {
  const [bagOpen, setBagOpen] = useState(false);
  return <div className="editorial-store">
    <a href="#store-content" className="editorial-skip">Skip to content</a>
    <EditorialHeader highlights={highlights} onOpenBag={() => setBagOpen(true)} />
    <div id="store-content">{children}</div>
    <EditorialBag open={bagOpen} onClose={() => setBagOpen(false)} />
    <EditorialFooter socials={socials} />
  </div>;
}
