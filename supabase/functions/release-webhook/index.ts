import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

function extractPlatformUrls(assets: any[]): Record<string, string> {
  const urls: Record<string, string> = {};
  assets?.forEach((asset) => {
    const name = (asset.name || '').toLowerCase();
    const url = asset.browser_download_url;
    if (!url) return;
    if (name.includes('arm64') && name.endsWith('.dmg')) urls.mac_arm64 = url;
    else if ((name.includes('x64') || name.includes('intel')) && name.endsWith('.dmg')) urls.mac_x64 = url;
    else if (name.endsWith('.dmg')) urls.mac = url;
    else if (name.endsWith('.exe')) urls.windows = url;
    else if (name.endsWith('.appimage')) urls.linux = url;
    else if (name.endsWith('.deb')) urls.linux_deb = url;
    else if (name.endsWith('.apk')) urls.android = url;
    else if (name.endsWith('.zip') && name.includes('extension')) urls.chrome = url;
  });
  return urls;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const expected = Deno.env.get('RELEASE_WEBHOOK_SECRET');
    if (!expected) {
      return new Response(JSON.stringify({ error: 'not_configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const provided = req.headers.get('x-webhook-secret')
      ?? req.headers.get('authorization')?.replace('Bearer ', '');
    if (provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const platform_urls = extractPlatformUrls(body.assets || []);

    const { error: upsertErr } = await supabase
      .from('app_releases')
      .upsert(
        {
          tag: body.release_tag,
          name: body.release_name,
          url: body.release_url,
          published_at: body.published_at,
          assets: body.assets ?? [],
          platform_urls,
          is_latest: true,
        },
        { onConflict: 'tag' },
      );
    if (upsertErr) throw upsertErr;

    return new Response(
      JSON.stringify({ success: true, platform_urls }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('release-webhook error', e);
    return new Response(
      JSON.stringify({ success: false, error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
