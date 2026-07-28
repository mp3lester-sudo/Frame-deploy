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
      review_reactions: {
        Row: { review_id: string; user_id: string; reaction: string; created_at: string };
        Insert: { review_id: string; user_id: string; reaction: string };
        Update: never;
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
      movie_nights: {
        Row: {
          id: string;
          host_id: string;
          status: "collecting" | "decided" | "cancelled";
          decided_title_id: string | null;
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
      people: {
        Row: { id: string; tmdb_id: number | null; name: string; role: string | null; photo_url: string | null; created_at: string };
        Insert: { tmdb_id?: number; name: string; role?: string; photo_url?: string };
        Update: Partial<{ name: string; role: string; photo_url: string }>;
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
          updated_at: string;
        };
        Insert: {
          title_id: string;
          provider: string;
          region?: string;
          offer_type: "subscription" | "rent" | "buy";
          url?: string;
        };
        Update: Partial<{ url: string }>;
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
          current_period_end: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: string;
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
    };
    Views: Record<string, never>;
    Functions: {
      match_titles_for_user: {
        Args: { p_user_id: string; p_match_count?: number; p_exclude_watched?: boolean };
        Returns: { title_id: string; similarity: number }[];
      };
      similar_users_liked: {
        Args: { p_user_id: string; p_match_count?: number };
        Returns: { title_id: string; score: number }[];
      };
      upsert_taste_vector_from_rating: {
        Args: { p_user_id: string; p_title_id: string; p_score: number };
        Returns: void;
      };
      match_titles_by_query: {
        Args: { p_embedding: number[]; p_match_count?: number };
        Returns: { title_id: string; similarity: number }[];
      };
      check_rate_limit: {
        Args: { p_key: string; p_max_requests: number; p_window_seconds: number };
        Returns: boolean;
      };
    };
  };
}
