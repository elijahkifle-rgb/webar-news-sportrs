// ── Request counter (in-memory, resets on Worker restart) ─────────────────────
let requestCount  = 0   // total requests received from frontend
let upstreamCount = 0   // total calls made to football-data.org

// ── Rate limiting ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map()

function isRateLimited(ip) {
	const now         = Date.now()
	const windowMs    = 60 * 1000
	const maxRequests = 500

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
	if (p.includes('GOALKEEPER'))                                              return 'G'
	if (p.includes('BACK') || p.includes('DEFENCE'))                          return 'D'
	if (p.includes('MIDFIELD'))                                               return 'M'
	if (p.includes('FORWARD') || p.includes('OFFENCE') || p.includes('WINGER')) return 'F'
	return 'M'
}

// ── Main Worker ───────────────────────────────────────────────────────────────
export default {
	async fetch(request, env, ctx) {

		// 1. CORS
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

		// ── LOGGING: count incoming request from frontend ─────────────────────
		requestCount++
		console.log(`[REQUEST] #${requestCount} matchId=${matchId} ip=${clientIP} time=${new Date().toISOString()}`)

		// 7. Fetch from football-data.org
		try {
			// ── LOGGING: count upstream call to external service ──────────────
			upstreamCount++
			console.log(`[UPSTREAM] #${upstreamCount} matchId=${matchId} calling football-data.org`)

			const response = await fetch(
				`https://api.football-data.org/v4/matches/${matchId}`,
				{ headers: { 'X-Auth-Token': API_KEY } }
			)

			if (!response.ok) throw new Error(`API responded with ${response.status}`)

			const data = await response.json()

			// ── LOGGING: log result ───────────────────────────────────────────
			console.log(`[UPSTREAM] #${upstreamCount} matchId=${matchId} status=OK home=${data.score?.fullTime?.home} away=${data.score?.fullTime?.away}`)

			// 8. Normalize response
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

			// ── LOGGING: summary after each request ───────────────────────────
			console.log(`[SUMMARY] totalRequests=${requestCount} totalUpstream=${upstreamCount} ratio=${(upstreamCount/requestCount*100).toFixed(0)}%`)

			return new Response(JSON.stringify(transformed), {
				headers: {
					'Content-Type': 'application/json',
					'X-Request-Count':  String(requestCount),
					'X-Upstream-Count': String(upstreamCount),
					...corsHeaders
				}
			})

		} catch (error) {
			console.log(`[ERROR] matchId=${matchId} error=${error.message}`)
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json', ...corsHeaders }
			})
		}
	}
}
