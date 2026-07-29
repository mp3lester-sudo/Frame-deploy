import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const url = get("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = get("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, serviceKey);

const email = `mp3lester+diag${Date.now()}@gmail.com`;
const password = "DiagTest123!";
const username = `diag_${Date.now()}`.replace(/[^a-z0-9_]/g, "").slice(-20);

const { data, error } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { username },
});
if (error) throw error;
await admin.from("profiles").insert({ id: data.user.id, username, display_name: username });

console.log(JSON.stringify({ email, password, username, userId: data.user.id }));
