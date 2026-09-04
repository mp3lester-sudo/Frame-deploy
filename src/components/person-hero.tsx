From a974c24a665fea9dccbe205491fbec0e6e000747 Mon Sep 17 00:00:00 2001
From: Michael Lester <mp3lester@gmail.com>
Date: Thu, 3 Sep 2026 16:07:12 -0700
Subject: [PATCH] Person hero: Bebas Neue name treatment + center actor faces
 in crop
 
- H1 name now renders font-hollywood (Bebas Neue) uppercase with
  letter-spacing, matching the SLATE nav wordmark's font, instead of
  the italic serif used for section headers elsewhere on the page.
- Photo crop switched from object-top to object-center so portrait
  actor headshots keep the face in view once cropped into the wide
  full-bleed hero box, instead of biasing toward the top edge (a
  rule that made sense for movie backdrops but not headshots).
- Updated the file's doc comment to explain both choices.
---
 src/components/person-hero.tsx | 21 ++++++++++++++++-----
 1 file changed, 16 insertions(+), 5 deletions(-)
 
diff --git a/src/components/person-hero.tsx b/src/components/person-hero.tsx
index 1d98b09..22f48ca 100644
--- a/src/components/person-hero.tsx
+++ b/src/components/person-hero.tsx
@@ -4,9 +4,20 @@ import { BackButton } from "@/components/ui/back-button";
 /**
  * Full-bleed backdrop hero for a person page -- same container pattern as
  * BackdropHero on the movie page (-mt-14 to extend under the nav's own
- * reserved space, object-cover object-top since a portrait-aspect source
- * cropped into a much wider box loses the most by centering, long
- * two-stop bottom fade so overlaid text reads cleanly the whole way up).
+ * reserved space, long two-stop bottom fade so overlaid text reads
+ * cleanly the whole way up). Unlike BackdropHero's movie backdrops
+ * (landscape key art, object-top biases toward faces near the top of the
+ * frame), a person's source photo is portrait-aspect -- object-center
+ * keeps the face itself in view once that's cropped into a much wider
+ * box, since these photos are framed around the face/head rather than
+ * having it pinned to the top edge.
+ *
+ * Name renders in Bebas Neue (font-hollywood) -- the same face used for
+ * the SLATE wordmark in the nav, per product direction -- uppercase and
+ * letter-spaced rather than the italic serif used for section headers
+ * elsewhere on this page, for a bolder marquee-style treatment over the
+ * photo.
+ *
  * Replaces the earlier side-by-side "small portrait rectangle + name/bio"
  * layout, which was the one major page in the app with no hero moment at
  * all and plain gray section headers unlike everywhere else -- see
@@ -44,7 +55,7 @@ export function PersonHero({
   return (
     <div className="relative -mt-14 h-[380px] w-full overflow-hidden sm:h-[520px]">
       {photoSrc ? (
-        <Image src={photoSrc} alt="" fill priority sizes="100vw" className="object-cover object-top" />
+        <Image src={photoSrc} alt="" fill priority sizes="100vw" className="object-cover object-center" />
       ) : (
         // No-photo fallback: same idea as the old initials circle, just
         // filling the full-bleed box instead of a small rounded rect.
@@ -62,7 +73,7 @@ export function PersonHero({
       </div>
 
       <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-6 sm:pb-8">
-        <h1 className="font-display text-3xl italic text-foreground sm:text-5xl">{name}</h1>
+        <h1 className="font-hollywood text-4xl uppercase tracking-[0.02em] text-foreground sm:text-6xl">{name}</h1>
         {/* Birthday/place aren't rendered here -- they come from the same
             TMDB bio lookup as the biography text (see PersonBio and
             PersonEnrichment in page.tsx), which is behind its own Suspense
-- 
2.34.1
 