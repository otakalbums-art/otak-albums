/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@otak/ui", "@otak/supabase"],
  images: {
    // Прев'ю фото роздаються через Supabase Storage (signed URLs).
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" },
    ],
  },
};
module.exports = nextConfig;
