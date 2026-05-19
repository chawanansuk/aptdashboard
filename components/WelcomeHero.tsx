"use client";

import { useSession } from "next-auth/react";
import type { ModeConfig, GreetingStats } from "@/lib/modeConfig";

interface Props {
  config: ModeConfig;
  stats: GreetingStats;
}

/**
 * Welcome hero — shown at the top of the overview view to set the
 * "this is YOUR workspace" tone. Role-aware:
 *
 * - Sales:     🌅 customer-facing greeting, vacancy + contracts focus
 * - Engineer:  🔧 work-focused, today's tasks + overdue maintenance
 * - Management: 📊 strategic KPIs, occupancy + revenue
 *
 * The accent color (background tint, icon) follows the mode's
 * `accentHex` so the hero visually anchors the rest of the page in
 * the same color story.
 */
export default function WelcomeHero({ config, stats }: Props) {
  const { data: session } = useSession();
  const name = friendlyName(session?.user?.name, session?.user?.email);

  // Time-of-day variation feels personal — keeps the greeting from
  // looking like a static template.
  const hour = new Date().getHours();
  const greeting =
    hour < 5  ? "ดึกแล้วนะ" :
    hour < 12 ? "อรุณสวัสดิ์" :
    hour < 13 ? "สวัสดียามเที่ยง" :
    hour < 18 ? "สวัสดีตอนบ่าย" :
                "สวัสดีตอนเย็น";

  const subtitle = config.greetingSubtitle(stats);

  return (
    <section
      className={`ac-welcome-hero ac-welcome-hero-${config.mode}`}
      aria-label="ทักทาย"
    >
      <div className="ac-welcome-hero-icon" aria-hidden>
        {config.emoji}
      </div>
      <div className="ac-welcome-hero-text">
        <div className="ac-welcome-hero-line1">
          <span className="ac-welcome-hero-greeting">{greeting}</span>
          {name && <span className="ac-welcome-hero-name"> · {name}</span>}
        </div>
        <div className="ac-welcome-hero-line2">{subtitle}</div>
        <div className="ac-welcome-hero-tagline">{config.tagline}</div>
      </div>
    </section>
  );
}

function friendlyName(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    // First name only — feels more personal than full name
    const first = name.trim().split(/\s+/)[0];
    return first;
  }
  if (email) return email.split("@")[0];
  return "";
}
