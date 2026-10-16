import { setRequestLocale } from "next-intl/server";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { getCurrentUser } from "@/lib/auth/current-user";
import { emptyPreferences, emptyProfile } from "@/lib/profile-defaults";

/**
 * 「完善个人信息」 — module P.
 *
 * Lives inside the `(main)` group so the bottom tab bar stays available; the
 * editor itself renders the header and the sticky save bar.
 *
 * `?tab=partner` opens the partner-condition tab directly, which is what the
 * 「去设置」 link on the profile page points at.
 */
export default async function ProfileEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { tab } = await searchParams;
  const currentUser = await getCurrentUser();

  return (
    <ProfileEditor
      profile={currentUser.profile ?? emptyProfile}
      preferences={currentUser.preferences ?? emptyPreferences}
      level={currentUser.subscription.level ?? currentUser.level}
      initialTab={tab === "partner" ? "partner" : "about"}
    />
  );
}
