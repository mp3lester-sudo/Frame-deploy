/**
 * Hand-maintained placeholder types matching supabase/migrations/0001_init.sql.
 * Once the project is linked to a real Supabase instance, regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 */
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          is_creator: boolean;
          is_premium: boolean;
          premium_tier: "premium" | "auteur" | null;
          experience_tier: "rookie" | "intermediate" | "pro" | null;
          last_reengagement_email_at: string | null;
          referral_code: string;
          referred_by: string | null;
          bonus_premium_until: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; username: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      titles: {
        Row: {
          id: string;
          tmdb_id: number | null;
          type: "movie" | "tv";
          name: string;
          original_name: string | null;
          overview: string | null;
          release_date: string | null;
          runtime_minutes: number | null;
          poster_url: string | null;
          backdrop_url: string | null;
          original_language: string | null;
          genres: string[];
          themes: string[];
          tone: string[];
          pacing: string | null;
          violence_level: number | null;
          comedy_level: number | null;
          emotional_intensity: number | null;
          dialogue_density: number | null;
          ending_type: string | null;
          color_palette: string[] | null;
          mood_tags: string[];
          tmdb_rating: number | null;
          tmdb_vote_count: number | null;
          popularity: number | null;
          weighted_rating: number | null;
          imdb_id: string | null;
          rt_critic_score: number | null;
          rt_checked_at: string | null;
          streaming_checked_at: string | null;
          poster_font: string | null;
          poster_font_checked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["titles"]["Row"]> & { type: "movie" | "tv"; name: string };
        Update: Partial<Database["public"]["Tables"]["titles"]["Row"]>;
        Relationships: [];
      };
      ratings: {
        Row: {
          id: string;
          user_id: string;
          title_id: string;
          score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; title_id: string; score: number };
        Update: Partial<{ score: number }>;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          user_id: string;
          title_id: string;
          body: string;
          contains_spoilers: boolean;
          like_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; title_id: string; body: string; contains_spoilers?: boolean };
        Update: Partial<{ body: string; contains_spoilers: boolean }>;
        Relationships: [];
      };
      lists: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { user_id: string; title: string; description?: string; is_public?: boolean };
        Update: Partial<{ title: string; description: string; is_public: boolean }>;
        Relationships: [];
      };
      favorite_titles: {
        Row: { user_id: string; title_id: string; position: number; created_at: string };
        Insert: { user_id: string; title_id: string; position: number };
        Update: Partial<{ title_id: string; position: number }>;
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: string };
        Insert: { follower_id: string; followee_id: string };
        Update: never;
        Relationships: [];
      };
      taste_vectors: {
        Row: { user_id: string; embedding: number[]; sample_size: number; updated_at: string };
        Insert: { user_id: string; embedding: number[]; sample_size?: number };
        Update: Partial<{ embedding: number[]; sample_size: number }>;
        Relationships: [];
      };
      title_embeddings: {
        Row: { title_id: string; embedding: number[]; model: string; updated_at: string };
        Insert: { title_id: string; embedding: number[]; model?: string };
        Update: Partial<{ embedding: number[]; model: string }>;
        Relationships: [];
      };
      watch_history: {
        Row: { id: string; user_id: string; title_id: string; watched_at: string; source: string };
        Insert: { user_id: string; title_id: string; watched_at?: string; source?: string };
        Update: Partial<{ watched_at: string; source: string }>;
        Relationships: [];
      };
      watchlist: {
        Row: { id: string; user_id: string; title_id: string; added_at: string };
        Insert: { user_id: string; title_id: string; added_at?: string };
        Update: never;
        Relationships: [];
      };
      review_reactions: {
        Row: { review_id: string; user_id: string; reaction: string; created_at: string };
        Insert: { review_id: string; user_id: string; reaction: string };
        Update: never;
        Relationships: [];
      };
      review_comments: {
        Row: { id: string; review_id: string; user_id: string; body: string; created_at: string };
        Insert: { review_id: string; user_id: string; body: string };
        Update: never;
        Relationships: [];
      };
      referrals: {
        Row: {
          id: string;
          referrer_id: string;
          referred_id: string;
          created_at: string;
        };
        Insert: { referrer_id: string; referred_id: string };
        Update: never;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          content_type: "review" | "review_comment" | "message" | "club_post" | "profile";
          content_id: string;
          reason: "spam" | "harassment" | "hate_speech" | "sexual_content" | "spoilers" | "other";
          note: string | null;
          status: "open" | "reviewed" | "dismissed";
          created_at: string;
        };
        Insert: {
          reporter_id: string;
          content_type: "review" | "review_comment" | "message" | "club_post" | "profile";
          content_id: string;
          reason: "spam" | "harassment" | "hate_speech" | "sexual_content" | "spoilers" | "other";
          note?: string | null;
        };
        Update: Partial<{ status: "open" | "reviewed" | "dismissed" }>;
        Relationships: [];
      };
      user_blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string };
        Update: never;
        Relationships: [];
      };
      clubs: {
        Row: { id: string; name: string; description: string; created_by: string; created_at: string };
        Insert: { name: string; description?: string; created_by: string };
        Update: Partial<{ name: string; description: string }>;
        Relationships: [];
      };
      club_members: {
        Row: { club_id: string; user_id: string; role: "owner" | "member"; joined_at: string };
        Insert: { club_id: string; user_id: string; role?: "owner" | "member" };
        Update: never;
        Relationships: [];
      };
      club_posts: {
        Row: { id: string; club_id: string; user_id: string; body: string; created_at: string };
        Insert: { club_id: string; user_id: string; body: string };
        Update: never;
        Relationships: [];
      };
      conversations: {
        Row: { id: string; user_a: string; user_b: string; created_at: string };
        Insert: { user_a: string; user_b: string };
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; read_at: string | null };
        Insert: { conversation_id: string; sender_id: string; body: string };
        Update: Partial<{ read_at: string }>;
        Relationships: [];
      };
      list_items: {
        Row: { list_id: string; title_id: string; position: number; note: string | null; added_at: string };
        Insert: { list_id: string; title_id: string; position?: number; note?: string };
        Update: Partial<{ position: number; note: string }>;
        Relationships: [];
      };
      activity_events: {
        Row: {
          id: string;
          user_id: string;
          event_type: "rated" | "reviewed" | "watched" | "list_created" | "followed";
          title_id: string | null;
          ref_id: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          event_type: "rated" | "reviewed" | "watched" | "list_created" | "followed";
          title_id?: string | null;
          ref_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          actor_id: string | null;
          type: "follow" | "comment" | "reaction" | "movie_night_invite" | "movie_night_decided" | "payment_failed";
          title_id: string | null;
          ref_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          recipient_id: string;
          actor_id?: string | null;
          type: "follow" | "comment" | "reaction" | "movie_night_invite" | "movie_night_decided" | "payment_failed";
          title_id?: string | null;
          ref_id?: string | null;
          read_at?: string | null;
        };
        Update: Partial<{ read_at: string | null }>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
        };
        Update: Partial<{ endpoint: string; p256dh: string; auth: string }>;
        Relationships: [];
      };
      title_image_overrides: {
        Row: {
          user_id: string;
          title_id: string;
          poster_url: string | null;
          backdrop_url: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          title_id: string;
          poster_url?: string | null;
          backdrop_url?: string | null;
          updated_at?: string;
        };
        Update: Partial<{ poster_url: string | null; backdrop_url: string | null; updated_at: string }>;
        Relationships: [];
      };
      recommendation_impressions: {
        Row: {
          id: string;
          user_id: string;
          title_id: string;
          match_percent: number | null;
          is_cold_start: boolean;
          reason: string | null;
          source: string;
          served_at: string;
        };
        Insert: {
          user_id: string;
          title_id: string;
          match_percent?: number | null;
          is_cold_start?: boolean;
          reason?: string | null;
          source?: string;
        };
        Update: Partial<{
          match_percent: number | null;
          is_cold_start: boolean;
          reason: string | null;
          source: string;
        }>;
        Relationships: [];
      };
      discover_filter_presets: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          genre: string | null;
          era: string | null;
          pacing: string | null;
          tone: string | null;
          mood: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          genre?: string | null;
          era?: string | null;
          pacing?: string | null;
          tone?: string | null;
          mood?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["discover_filter_presets"]["Row"], "id" | "user_id">>;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          type: "follow" | "comment" | "reaction" | "movie_night_invite" | "movie_night_decided";
          push_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          type: "follow" | "comment" | "reaction" | "movie_night_invite" | "movie_night_decided";
          push_enabled?: boolean;
        };
        Update: Partial<{ push_enabled: boolean }>;
        Relationships: [];
      };
      movie_nights: {
        Row: {
          id: string;
          host_id: string;
          status: "collecting" | "decided" | "cancelled";
          decided_title_id: string | null;
          invite_token: string;
          created_at: string;
        };
        Insert: { host_id: string; status?: "collecting" | "decided" | "cancelled" };
        Update: Partial<{ status: "collecting" | "decided" | "cancelled"; decided_title_id: string | null }>;
        Relationships: [];
      };
      movie_night_participants: {
        Row: {
          movie_night_id: string;
          user_id: string;
          available_providers: string[];
          excluded_genres: string[];
          mood: string | null;
          joined_at: string;
        };
        Insert: {
          movie_night_id: string;
          user_id: string;
          available_providers?: string[];
          excluded_genres?: string[];
          mood?: string;
        };
        Update: Partial<{ available_providers: string[]; excluded_genres: string[]; mood: string | null }>;
        Relationships: [];
      };
      movie_night_votes: {
        Row: {
          movie_night_id: string;
          title_id: string;
          user_id: string;
          vote: "like" | "pass";
          created_at: string;
        };
        Insert: { movie_night_id: string; title_id: string; user_id: string; vote: "like" | "pass" };
        Update: never;
        Relationships: [];
      };
      people: {
        Row: {
          id: string;
          tmdb_id: number | null;
          name: string;
          role: string | null;
          photo_url: string | null;
          bio: string | null;
          birthday: string | null;
          place_of_birth: string | null;
          bio_checked_at: string | null;
          created_at: string;
        };
        Insert: { tmdb_id?: number; name: string; role?: string; photo_url?: string };
        Update: Partial<{
          name: string;
          role: string;
          photo_url: string;
          bio: string | null;
          birthday: string | null;
          place_of_birth: string | null;
          bio_checked_at: string | null;
        }>;
        Relationships: [];
      };
      title_credits: {
        Row: {
          title_id: string;
          person_id: string;
          credit_type: "director" | "writer" | "composer" | "actor" | "cinematographer";
          character_name: string | null;
          billing_order: number | null;
        };
        Insert: {
          title_id: string;
          person_id: string;
          credit_type: "director" | "writer" | "composer" | "actor" | "cinematographer";
          character_name?: string;
          billing_order?: number;
        };
        Update: never;
        Relationships: [];
      };
      streaming_availability: {
        Row: {
          title_id: string;
          provider: string;
          region: string;
          offer_type: "subscription" | "rent" | "buy";
          url: string | null;
          logo_url: string | null;
          updated_at: string;
        };
        Insert: {
          title_id: string;
          provider: string;
          region?: string;
          offer_type: "subscription" | "rent" | "buy";
          url?: string;
          logo_url?: string;
        };
        Update: Partial<{ url: string; logo_url: string }>;
        Relationships: [];
      };
      taste_attributes: {
        Row: {
          user_id: string;
          pacing_preference: string | null;
          violence_tolerance: number | null;
          comedy_tolerance: number | null;
          emotional_intensity_preference: number | null;
          favorite_genres: string[];
          favorite_decades: string[];
          favorite_directors: string[];
          updated_at: string;
        };
        Insert: { user_id: string } & Partial<Omit<Database["public"]["Tables"]["taste_attributes"]["Row"], "user_id" | "updated_at">>;
        Update: Partial<Omit<Database["public"]["Tables"]["taste_attributes"]["Row"], "user_id">>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          status: string;
          tier: "premium" | "auteur";
          current_period_end: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: string;
          tier?: "premium" | "auteur";
          current_period_end?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["subscriptions"]["Row"], "user_id">>;
        Relationships: [];
      };
      rate_limit_buckets: {
        Row: { key: string; window_start: string; count: number };
        Insert: { key: string; window_start: string; count?: number };
        Update: Partial<{ count: number }>;
        Relationships: [];
      };
      game_pass_seasons: {
        Row: {
          id: string;
          period_start: string;
          day_count: number;
          theme_name: string;
          theme_description: string;
          theme_genres: string[];
          theme_keywords: string[];
          theme_decade_min: number | null;
          theme_decade_max: number | null;
          created_at: string;
        };
        Insert: {
          period_start: string;
          day_count: number;
          theme_name: string;
          theme_description: string;
          theme_genres?: string[];
          theme_keywords?: string[];
          theme_decade_min?: number | null;
          theme_decade_max?: number | null;
        };
        Update: never;
        Relationships: [];
      };
      game_pass_entries: {
        Row: {
          id: string;
          season_id: string;
          user_id: string;
          joined_at: string;
          completed_at: string | null;
          reward_granted_at: string | null;
        };
        Insert: { season_id: string; user_id: string };
        Update: never;
        Relationships: [];
      };
      game_pass_picks: {
        Row: { id: string; season_id: string; user_id: string; day_number: number; title_id: string; generated_at: string };
        Insert: { season_id: string; user_id: string; day_number: number; title_id: string };
        Update: never;
        Relationships: [];
      };
      wrapped_shares: {
        Row: { id: string; user_id: string; year: number; stats: Record<string, unknown>; created_at: string };
        Insert: { user_id: string; year: number; stats: Record<string, unknown> };
        Update: never;
        Relationships: [];
      };
      daily_trivia: {
        Row: {
          date_key: string;
          title_id: string | null;
          question_type: string;
          question: string;
          options: string[];
          correct_index: number;
          created_at: string;
        };
        Insert: {
          date_key: string;
          title_id?: string | null;
          question_type: string;
          question: string;
          options: string[];
          correct_index: number;
        };
        Update: never;
        Relationships: [];
      };
      daily_trivia_responses: {
        Row: {
          user_id: string;
          date_key: string;
          selected_index: number;
          is_correct: boolean;
          created_at: string;
        };
        Insert: { user_id: string; date_key: string; selected_index: number; is_correct: boolean };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      compute_cinema_score: {
        Args: { p_user_id: string };
        Returns: { watched_count: number; reviewed_count: number; points: number }[];
      };
      resolve_movie_night_token: {
        Args: { p_token: string };
        Returns: { id: string; host_id: string }[];
      };
      movie_night_preview: {
        Args: { p_token: string };
        Returns: {
          status: string;
          host_username: string;
          host_display_name: string | null;
          host_avatar_url: string | null;
          participant_count: number;
          participant_avatars: string[];
        }[];
      };
      record_referral: {
        Args: { p_referrer_id: string; p_referred_id: string; p_bonus_days?: number };
        Returns: boolean;
      };
      reengagement_candidates: {
        Args: { p_inactive_days?: number; p_cooldown_days?: number };
        Returns: { user_id: string }[];
      };
      check_and_complete_game_pass: {
        Args: { p_season_id: string; p_user_id: string };
        Returns: boolean;
      };
      grant_game_pass_reward: {
        Args: { p_season_id: string; p_user_id: string };
        Returns: boolean;
      };
      get_or_create_game_pass_season: {
        Args: {
          p_period_start: string;
          p_day_count: number;
          p_theme_name: string;
          p_theme_description: string;
          p_theme_genres: string[];
          p_theme_keywords: string[];
          p_theme_decade_min: number | null;
          p_theme_decade_max: number | null;
        };
        Returns: Database["public"]["Tables"]["game_pass_seasons"]["Row"];
      };
      match_titles_for_user: {
        Args: {
          p_user_id: string;
          p_match_count?: number;
          p_exclude_watched?: boolean;
          p_min_similarity?: number;
        };
        Returns: { title_id: string; similarity: number }[];
      };
      title_similarity_for_user: {
        Args: { p_user_id: string; p_title_ids: string[] };
        Returns: { title_id: string; similarity: number }[];
      };
      titles_watched_by_users: {
        Args: { p_user_ids: string[]; p_title_ids: string[] };
        Returns: { title_id: string }[];
      };
      similar_users_liked: {
        Args: { p_user_id: string; p_match_count?: number; p_min_closeness?: number };
        Returns: { title_id: string; score: number }[];
      };
      behavioral_collaborative_recs: {
        Args: { p_user_id: string; p_match_count?: number; p_min_shared_likes?: number };
        Returns: { title_id: string; score: number }[];
      };
      similarity_to_disliked_titles: {
        Args: { p_user_id: string; p_title_ids: string[]; p_dislike_max_score?: number };
        Returns: { title_id: string; max_similarity: number }[];
      };
      similarity_to_implicit_positive_titles: {
        Args: { p_user_id: string; p_title_ids: string[] };
        Returns: { title_id: string; max_similarity_watchlist: number; max_similarity_watched_unrated: number }[];
      };
      upsert_taste_vector_from_rating: {
        Args: { p_user_id: string; p_title_id: string; p_score: number };
        Returns: void;
      };
      recompute_taste_vector_for_user: {
        Args: { p_user_id: string };
        Returns: void;
      };
      most_similar_liked_title: {
        Args: { p_user_id: string; p_title_id: string; p_min_similarity?: number };
        Returns: { title_id: string; similarity: number }[];
      };
      match_titles_by_query: {
        Args: { p_embedding: number[]; p_match_count?: number };
        Returns: { title_id: string; similarity: number }[];
      };
      check_rate_limit: {
        Args: { p_key: string; p_max_requests: number; p_window_seconds: number };
        Returns: boolean;
      };
      prune_rate_limit_buckets: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      titles_matching_names: {
        Args: { p_names: string[] };
        Returns: { id: string; name: string; release_date: string | null }[];
      };
      titles_on_this_day: {
        Args: { p_month: number; p_day: number; p_limit?: number };
        Returns: { id: string; name: string; poster_url: string | null; release_date: string | null; weighted_rating: number | null }[];
      };
    };
  };
}
