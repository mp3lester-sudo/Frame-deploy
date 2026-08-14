/**
 * Demo content for the Twitter-style social timeline (src/app/feed).
 *
 * These are hardcoded, not seeded into the reviews table -- this sandbox
 * doesn't have the project's Supabase service-role credentials available
 * (.env.local isn't present here), so there's no way to create real auth
 * users + real review rows the way scripts/verify-hot-takes.ts does.
 * Once real accounts are posting real reviews, this feed should pull from
 * the `reviews` table the same way Hot Takes already does; until then
 * this gives the page something real-looking to render.
 *
 * Photo posts reuse actual TMDB poster/backdrop URLs already used
 * elsewhere in the app (same titles that show up in the catalogue), so
 * the images are real and the captions are written to match the exact
 * image being shown, not generic filler.
 *
 * Each photo is tagged with its real orientation -- most of these TMDB
 * images are theatrical posters (2:3 portrait), not landscape stills.
 * They used to get force-cropped into the card's 16:11 hero frame,
 * which chopped out the vast majority of a portrait image and left a
 * meaningless sliver -- often just a strip of typography or a random
 * slice of a face, nothing a real person would post. PostCard now
 * renders "poster" photos in a portrait-friendly frame instead, which
 * also happens to be exactly how someone photographing a poster or a
 * physical disc case on their shelf would actually shoot it. "still"
 * is for the one genuinely landscape backdrop image in this set.
 */
export interface FakePost {
  id: string;
  author: { name: string; handle: string };
  timeAgo: string;
  body: string;
  photo?: { url: string; caption: string; orientation: "poster" | "still" };
  stats: { likes: number; comments: number; reposts: number };
}

export const FAKE_POSTS: FakePost[] = [
  {
    id: "p1",
    author: { name: "Marcus Doyle", handle: "doyleonfilm" },
    timeAgo: "2h",
    body: "Rewatched The Godfather for probably the twentieth time and I'm convinced the wedding scene is the single greatest opening 25 minutes in American film. Every character gets introduced through what they want, not what they say.",
    photo: {
      url: "https://image.tmdb.org/t/p/w780/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
      caption: "Still the standard everyone else gets measured against.",
      orientation: "poster",
    },
    stats: { likes: 214, comments: 31, reposts: 42 },
  },
  {
    id: "p2",
    author: { name: "Nadia Cortez", handle: "nadiac_film" },
    timeAgo: "4h",
    body: "Unpopular opinion: Apocalypse Now is 40 minutes too long and the Kurtz section drags the whole back half down. The river journey up to that point is unimpeachable though.",
    stats: { likes: 89, comments: 118, reposts: 12 },
  },
  {
    id: "p3",
    author: { name: "Priya Kapoor", handle: "priyawatches" },
    timeAgo: "6h",
    body: "Just finished Ivan's Childhood for the first time and I don't think I've recovered. Tarkovsky shooting a kid's nightmares like documentary footage should not work this well.",
    photo: {
      url: "https://image.tmdb.org/t/p/w780/trY9ADhXgSExH3DLlFhV5C8aDtw.jpg",
      caption: "This one's staying up on the wall for a while.",
      orientation: "poster",
    },
    stats: { likes: 156, comments: 9, reposts: 27 },
  },
  {
    id: "p4",
    author: { name: "Sam Reyes", handle: "samreyesfilm" },
    timeAgo: "8h",
    body: "Lawrence of Arabia on the biggest screen you can find, no exceptions. Streaming it on a laptop is basically a crime against David Lean.",
    photo: {
      url: "https://image.tmdb.org/t/p/w780/AiAm0EtDvyGqNpVoieRw4u65vD1.jpg",
      caption: "The desert IS the main character.",
      orientation: "poster",
    },
    stats: { likes: 302, comments: 14, reposts: 61 },
  },
  {
    id: "p5",
    author: { name: "Tom Whitfield", handle: "tomw_reviews" },
    timeAgo: "10h",
    body: "Hot take: Godfather Part III doesn't deserve the hate it gets. It's not Part I or II, but as a meditation on guilt and legacy it's genuinely moving once you stop comparing it to the first two.",
    photo: {
      url: "https://image.tmdb.org/t/p/w780/lm3pQ2QoQ16pextRsmnUbG2onES.jpg",
      caption: "Give it a real rewatch. It earns the ending.",
      orientation: "poster",
    },
    stats: { likes: 71, comments: 203, reposts: 8 },
  },
  {
    id: "p6",
    author: { name: "The Projection Booth", handle: "projectionbooth" },
    timeAgo: "12h",
    body: "Breakfast at Tiffany's holds up as a mood piece, but the Mickey Rooney casting is a genuinely rough watch in 2026. Worth knowing going in.",
    stats: { likes: 118, comments: 44, reposts: 19 },
  },
  {
    id: "p7",
    author: { name: "Aïcha Ben Youssef", handle: "aichacinephile" },
    timeAgo: "1d",
    body: "Rewatched Wild Tales last night for a group movie night and forgot how perfectly that anthology structure works when every segment ends exactly one beat past where you expect it to.",
    photo: {
      url: "https://image.tmdb.org/t/p/w1280/zb6fM1CX41D9rF9hdgclu0peUmy.jpg",
      caption: "Six short films, zero weak ones. Rare.",
      orientation: "still",
    },
    stats: { likes: 134, comments: 6, reposts: 22 },
  },
  {
    id: "p8",
    author: { name: "Devon Marsh", handle: "devonmarsh" },
    timeAgo: "1d",
    body: "Coppola directed The Godfather, Part II, AND Apocalypse Now within a six-year span and I genuinely don't think any director will ever match that run again.",
    stats: { likes: 267, comments: 19, reposts: 58 },
  },
  {
    id: "p9",
    author: { name: "Lena Ostrowski", handle: "lenawatches" },
    timeAgo: "1d",
    body: "Reminder that The Godfather Part II is a sequel that's also a prequel and somehow neither timeline feels like the weaker half. Still the gold standard for how to do it.",
    stats: { likes: 198, comments: 11, reposts: 34 },
  },
  {
    id: "p10",
    author: { name: "Nadia Cortez", handle: "nadiac_film" },
    timeAgo: "2d",
    body: "Started a mental Tarkovsky ranking and immediately gave up because Ivan's Childhood and Stalker are doing completely different things and I refuse to pick.",
    stats: { likes: 62, comments: 8, reposts: 5 },
  },
  {
    id: "p11",
    author: { name: "Marcus Doyle", handle: "doyleonfilm" },
    timeAgo: "2d",
    body: "Something underrated about Lawrence of Arabia: almost the entire cast is doing career-best work in service of a story that never lets you root for anyone uncomplicated. Peter O'Toole especially.",
    stats: { likes: 95, comments: 4, reposts: 11 },
  },
  {
    id: "p12",
    author: { name: "Sam Reyes", handle: "samreyesfilm" },
    timeAgo: "2d",
    body: "Movie night went off the rails when half the group hadn't seen Apocalypse Now and the other half wanted to argue theatrical cut vs. Redux for 40 minutes before we even pressed play.",
    photo: {
      url: "https://image.tmdb.org/t/p/w780/gQB8Y5RCMkv2zwzFHbUJX3kAhvA.jpg",
      caption: "We watched Redux. We do not regret it. Mostly.",
      orientation: "poster",
    },
    stats: { likes: 88, comments: 27, reposts: 6 },
  },
  {
    id: "p13",
    author: { name: "The Projection Booth", handle: "projectionbooth" },
    timeAgo: "3d",
    body: "A reminder that Breakfast at Tiffany's is, structurally, a pretty conventional romance -- it's Hepburn's performance doing 90% of the work that makes it feel timeless.",
    stats: { likes: 74, comments: 13, reposts: 9 },
  },
  {
    id: "p14",
    author: { name: "Aïcha Ben Youssef", handle: "aichacinephile" },
    timeAgo: "3d",
    body: "Ranking the Godfather trilogy is a fun exercise specifically because everyone agrees on the order and violently disagrees on the size of the gap between II and III.",
    stats: { likes: 143, comments: 52, reposts: 15 },
  },
  {
    id: "p15",
    author: { name: "Tom Whitfield", handle: "tomw_reviews" },
    timeAgo: "4d",
    body: "Ivan's Childhood came up in a discussion about films that changed how war gets shown on screen, and it deserves to be in that conversation way more than it usually is.",
    stats: { likes: 84, comments: 7, reposts: 16 },
  },
];
