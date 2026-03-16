// ── Rate limiting ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map()

function isRateLimited(ip) {
	const now        = Date.now()
	const windowMs   = 60 * 1000  // 1 minute
	const maxRequests = 500        // max per IP per minute

	if (!rateLimitMap.has(ip)) {
		rateLimitMap.set(ip, { count: 1, start: now })
		return false
	}

	const record = rateLimitMap.get(ip)

	if (now - record.start > windowMs) {
		rateLimitMap.set(ip, { count: 1, start: now })
		return false
	}

	record.count++
	return record.count > maxRequests
}

// ── Position mapper ───────────────────────────────────────────────────────────
function mapPosition(position) {
	if (!position) return 'M'
	const p = position.toUpperCase()
	if (p.includes('GOALKEEPER'))                            return 'G'
	if (p.includes('BACK') || p.includes('DEFENCE'))        return 'D'
	if (p.includes('MIDFIELD'))                             return 'M'
	if (p.includes('FORWARD') || p.includes('OFFENCE') || p.includes('WINGER')) return 'F'
	return 'M'
}

// ── Main Worker ───────────────────────────────────────────────────────────────
export default {
	async fetch(request, env, ctx) {

		// 1. CORS — only allow for frontend
		const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim())
		const requestOrigin  = request.headers.get('Origin') || ''
		const isAllowed      = allowedOrigins.includes(requestOrigin)

		const corsHeaders = {
			'Access-Control-Allow-Origin':  isAllowed ? requestOrigin : requestOrigin === '' ? '*' : 'null',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		}

		// 2. Preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders })
		}

		// 3. GET only
		if (request.method !== 'GET') {
			return new Response('Method not allowed', { status: 405, headers: corsHeaders })
		}

		// 4. Rate limiting
		const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown'
		if (isRateLimited(clientIP)) {
			return new Response(JSON.stringify({ error: 'Too many requests' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...corsHeaders }
			})
		}

		// 5. Validate match ID
		const url     = new URL(request.url)
		const matchId = url.pathname.split('/').pop()

		if (!matchId || !/^\d+$/.test(matchId)) {
			return new Response(JSON.stringify({ error: 'Invalid match ID' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', ...corsHeaders }
			})
		}

		// 6. Check API key
		const API_KEY = env.API_FOOTBALL_KEY
		if (!API_KEY) {
			return new Response(JSON.stringify({ error: 'API key not configured' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json', ...corsHeaders }
			})
		}

		// 7. Fetch from football-data.org
		try {
			const response = await fetch(
				`https://api.football-data.org/v4/matches/${matchId}`,
				{ headers: { 'X-Auth-Token': API_KEY } }
			)

			if (!response.ok) throw new Error(`API responded with ${response.status}`)

			const data = await response.json()

			// 8. Normalize — score + lineups
			const transformed = {
				matchId:  data.id,
				homeTeam: data.homeTeam.name,
				awayTeam: data.awayTeam.name,
				home:     data.score.fullTime.home ?? 0,
				away:     data.score.fullTime.away ?? 0,
				status:   data.status,
				minute:   data.minute ?? 0,
				period:   data.status === 'IN_PLAY'  ? 'LIVE'
					: data.status === 'FINISHED' ? 'FT'
						: 'UPCOMING',

				// Lineups — empty array if not available yet
				homeLineup: (data.homeTeam.lineup ?? []).map(p => ({
					id:     p.id,
					name:   p.name,
					number: p.shirtNumber ?? 0,
					pos:    mapPosition(p.position)
				})),
				awayLineup: (data.awayTeam.lineup ?? []).map(p => ({
					id:     p.id,
					name:   p.name,
					number: p.shirtNumber ?? 0,
					pos:    mapPosition(p.position)
				}))
			}

			return new Response(JSON.stringify(transformed), {
				headers: { 'Content-Type': 'application/json', ...corsHeaders }
			})

		} catch (error) {
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json', ...corsHeaders }
			})
		}
	}
}
