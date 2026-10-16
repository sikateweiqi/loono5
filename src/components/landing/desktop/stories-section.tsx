import { ArrowRight, Quote, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { listCatalogMembers } from "@/lib/db/members";

import { Container, Section, SectionHeading } from "./section";

interface Story {
  name: string;
  meta: string;
  quote: string;
}

/** Testimonial cards. Photos are drawn from the member directory in pairs. */
export async function StoriesSection() {
  const t = await getTranslations("portal");
  const items = t.raw("stories.items") as Story[];
  const photos = await listCatalogMembers();

  return (
    <Section id="stories">
      <Container>
        <SectionHeading
          eyebrow={t("stories.eyebrow")}
          title={t("stories.title")}
          subtitle={t("stories.subtitle")}
        />

        <ul className="mt-14 grid gap-5 lg:grid-cols-3 xl:gap-6">
          {items.map((story, index) => {
            const first = photos[(index * 2) % photos.length];
            const second = photos[(index * 2 + 1) % photos.length];

            return (
              <li
                key={story.name}
                className="glass-card flex flex-col gap-5 rounded-3xl p-7"
              >
                <div className="flex items-center justify-between">
                  <Quote
                    className="size-7 text-loono-champagne-deep/50"
                    strokeWidth={1.8}
                  />

                  <span className="flex items-center gap-0.5" aria-hidden>
                    {Array.from({ length: 5 }).map((_, star) => (
                      <Star
                        key={star}
                        className="size-3.5 fill-loono-amber text-loono-amber"
                      />
                    ))}
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-foreground/85">
                  “{story.quote}”
                </p>

                <div className="mt-auto flex items-center gap-3 border-t border-border pt-5">
                  <span className="flex -space-x-3">
                    {[first, second].map((user) =>
                      user ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={user.id}
                          src={user.avatarUrl}
                          alt=""
                          loading="lazy"
                          className="size-9 rounded-full border-2 border-white object-cover"
                        />
                      ) : null,
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {story.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {story.meta}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-10 flex justify-center">
          <Link
            href="/catalog"
            className="loono-cta-ghost group flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold"
          >
            {t("stories.cta")}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Container>
    </Section>
  );
}
