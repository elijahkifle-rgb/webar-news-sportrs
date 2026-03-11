/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const matchId = url.pathname.split('/').pop();

    if (!matchId || !/^\d+$/.test(matchId)) {
      return new Response('Invalid match ID', { status: 400, headers: corsHeaders });
    }

    const API_KEY = env.FOOTBALL_API_KEY;

    try {
      const response = await fetch(
        `https://api.football-data.org/v4/matches/${matchId}`,
        { headers: { 'X-Auth-Token': API_KEY } }
      );

      if (!response.ok) throw new Error(`API responded with ${response.status}`);

      const data = await response.json();

      const transformed = {
        home: data.score.fullTime.home ?? 0,
        away: data.score.fullTime.away ?? 0,
        homeTeam: data.homeTeam.name,
        awayTeam: data.awayTeam.name,
        status: data.status,
        minute: data.minute ?? 0,
        period: data.status === 'IN_PLAY' ? 'LIVE' : 
                data.status === 'FINISHED' ? 'FT' : 'UPCOMING'
      };

      return new Response(JSON.stringify(transformed), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};