import { ArrowRight, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { listCatalogMembers } from "@/lib/db/members";

import { Container, Section, SectionHeading } from "./section";

/**
 * Cities with a live member presence. Seeded from the member directory so the
 * list grows automatically as members are added.
 */
const EXTRA_CITIES = [
  "Beijing",
  "London",
  "Dubai",
  "Paris",
  "Seoul",
  "Berlin",
  "Toronto",
  "Sydney",
];

export async function RegionsSection() {
  const t = await getTranslations("portal");

  const members = await listCatalogMembers();
  const cities = Array.from(
    new Set([
      ...members.map((user) => user.city).filter(Boolean),
      ...EXTRA_CITIES,
    ]),
  ).sort((a, b) => a.localeCompare(b));

  return (
    <Section id="regions">
      <Container>
        <SectionHeading
          eyebrow={t("regions.eyebrow")}
          title={t("regions.title")}
          subtitle={t("regions.subtitle")}
        />

        <ul className="mx-auto mt-12 flex max-w-4xl flex-wrap justify-center gap-2.5">
          {cities.map((city) => (
            <li key={city}>
              <Link
                href="/catalog"
                className="flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-foreground/75 transition-colors hover:border-loono-champagne hover:text-foreground"
              >
                <MapPin className="size-3.5 shrink-0 text-loono-champagne-deep/80" />
                {city}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex justify-center">
          <Link
            href="/catalog"
            className="loono-cta-ghost group flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold"
          >
            {t("regions.cta")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Container>
    </Section>
  );
}
