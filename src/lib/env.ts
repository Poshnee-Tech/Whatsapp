// Read lazily so `next build` works without secrets present.
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get metaAppSecret() {
    return required("META_APP_SECRET");
  },
  get verifyToken() {
    return required("WA_VERIFY_TOKEN");
  },
  get accessToken() {
    return required("WA_ACCESS_TOKEN");
  },
  get phoneNumberId() {
    return required("WA_PHONE_NUMBER_ID");
  },
  get graphApiVersion() {
    return required("WA_GRAPH_API_VERSION");
  },
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get autoReplyPing() {
    return process.env.AUTO_REPLY_PING === "true";
  },
};
