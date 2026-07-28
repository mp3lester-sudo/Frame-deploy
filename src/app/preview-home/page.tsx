import { TasteHome } from "@/components/home/taste-home";

/**
 * Screenshot-only preview route — renders the authenticated home experience
 * without requiring a real Supabase session. Not linked from anywhere in the
 * app; safe to delete once no longer needed for previews.
 */
export default function PreviewHomePage() {
  return <TasteHome username="mp3lester" ratedCount={13} />;
}
