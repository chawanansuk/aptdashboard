import type { ReactNode } from "react";
import { Icon, type IconName } from "@/lib/icons";

interface Props {
  title: ReactNode;
  /** Registry icon shown before the title. */
  icon?: IconName;
  /** Item count, rendered muted after the title: "ผู้สนใจเช่า (12)". */
  count?: number | null;
  subtitle?: ReactNode;
  /** Right-hand side: buttons, filters, navigation. Not printed. */
  actions?: ReactNode;
  /** Extra lines under the subtitle (status banners and the like). */
  children?: ReactNode;
  /** Extra class on the <header> for view-specific tweaks. */
  className?: string;
}

/**
 * The one page header (V2, group C). Before this, nine views each carried
 * their own header markup and CSS — .ac-page-title (22px/800),
 * .ac-parts-title / .ac-leads-title / .ac-vehicles-title /
 * .ac-recurring-title (text-xl/700 with an icon), .ac-pets-title (18px),
 * MaintLog's .ac-h2 — so the same kind of title changed size, weight and
 * icon treatment from page to page. Every view now renders this; the
 * overview keeps its green hero band instead.
 */
export default function PageHeader({ title, icon, count, subtitle, actions, children, className }: Props) {
  return (
    <header className={`ac-page-head${className ? ` ${className}` : ""}`}>
      <div className="ac-page-head-text">
        <h1 className="ac-page-title">
          {icon && <Icon name={icon} size={22} className="ac-page-title-icon" />}
          <span>{title}</span>
          {count != null && <span className="ac-page-count">({count})</span>}
        </h1>
        {subtitle && <p className="ac-page-sub">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="ac-page-head-actions ac-no-print">{actions}</div>}
    </header>
  );
}
