// Request counters
let requestCount  = 0
let upstreamCount = 0
let cacheHitCount = 0

//  Rate limiting
const rateLimitMap = new Map()
function isRateLimited(ip) {
	const now = Date.now()
	const windowMs  = 60 * 1000
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

// Position mapper
function mapPosition(position) {
	if (!position) return 'M'
	const p = position.toUpperCase()
	if (p.includes('GOALKEEPER')) return 'G'
	if (p.includes('BACK') || p.includes('DEFENCE')) return 'D'
	if (p.includes('MIDFIELD')) return 'M'
	if (p.includes('FORWARD') || p.includes('OFFENCE') || p.includes('WINGER')) return 'F'
	return 'M'
}

// generate fallback data for a match ID
function getFallbackData(matchId) {
	return {
		matchId: parseInt(matchId),
		homeTeam: `Team ${matchId}A`,
		awayTeam: `Team ${matchId}B`,
		home: 0,
		away: 0,
		status: "SCHEDULED",
		minute: 0,
		period: "UPCOMING",
		homeLineup: [],
		awayLineup: []
	}
}

// Main Worker
export default {
	async fetch(request, env, ctx) {
		// 1. CORS
		const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim())
		const requestOrigin = request.headers.get('Origin') || ''
		const isAllowed = allowedOrigins.includes(requestOrigin)
		const corsHeaders = {
			'Access-Control-Allow-Origin': isAllowed ? requestOrigin : requestOrigin === '' ? '*' : 'null',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		}

		// 2. Preflight
		if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

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
		const url = new URL(request.url)
		const matchId = url.pathname.split('/').pop()
		if (!matchId || !/^\d+$/.test(matchId)) {
			return new Response(JSON.stringify({ error: 'Invalid match ID' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', ...corsHeaders }
			})
		}

		// 6. API key check
		const API_KEY = env.API_FOOTBALL_KEY
		if (!API_KEY) {
			return new Response(JSON.stringify({ error: 'API key not configured' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json', ...corsHeaders }
			})
		}

		// Logging
		requestCount++
		console.log(`[REQUEST] #${requestCount} matchId=${matchId} ip=${clientIP}`)

		// ── Check for nocache parameter (to simulate cloud‑only)
		const noCache = url.searchParams.get('nocache') === 'true'

		// ── Edge Cache Lookup (skip if nocache)
		const cache = caches.default
		const cacheKey = new Request(`https://cache.internal/match/${matchId}`)
		let cachedResponse = null

		if (!noCache) {
			cachedResponse = await cache.match(cacheKey)
		}

		if (cachedResponse) {
			cacheHitCount++
			console.log(`[CACHE HIT] matchId=${matchId}`)
			const body = await cachedResponse.text()
			return new Response(body, {
				headers: {
					'Content-Type': 'application/json',
					'X-Cache': 'HIT',
					'X-Request-Count': String(requestCount),
					'X-Upstream-Count': String(upstreamCount),
					...corsHeaders
				}
			})
		}

		console.log(`[CACHE MISS] matchId=${matchId} (nocache=${noCache})`)

		// ── Fetch from upstream API (or fallback on error) ──────────────
		try {
			upstreamCount++
			console.log(`[UPSTREAM] #${upstreamCount} matchId=${matchId} calling football-data.org`)

			const response = await fetch(
				`https://api.football-data.org/v4/matches/${matchId}`,
				{
					headers: { 'X-Auth-Token': API_KEY },
					signal: AbortSignal.timeout(5000)   // 5 second timeout
				}
			)

			if (!response.ok) throw new Error(`API responded with ${response.status}`)

			const data = await response.json()
			console.log(`[UPSTREAM] OK home=${data.score?.fullTime?.home} away=${data.score?.fullTime?.away}`)

			// Normalize response (real data)
			const transformed = {
				matchId: data.id,
				homeTeam: data.homeTeam.name,
				awayTeam: data.awayTeam.name,
				home: data.score.fullTime.home ?? 0,
				away: data.score.fullTime.away ?? 0,
				status: data.status,
				minute: data.minute ?? 0,
				period: data.status === 'IN_PLAY' ? 'LIVE'
					: data.status === 'FINISHED' ? 'FT' : 'UPCOMING',
				homeLineup: (data.homeTeam.lineup ?? []).map(p => ({
					id: p.id,
					name: p.name,
					number: p.shirtNumber ?? 0,
					pos: mapPosition(p.position)
				})),
				awayLineup: (data.awayTeam.lineup ?? []).map(p => ({
					id: p.id,
					name: p.name,
					number: p.shirtNumber ?? 0,
					pos: mapPosition(p.position)
				}))
			}

			const jsonBody = JSON.stringify(transformed)

			// Store real response in cache (unless nocache)
			if (!noCache) {
				const cacheResponse = new Response(jsonBody, {
					headers: { 'Cache-Control': `public, max-age=60` }
				})
				ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()))
				console.log(`[CACHE SET] matchId=${matchId} TTL=60s (real data)`)
			}

			console.log(`[SUMMARY] totalRequests=${requestCount} totalUpstream=${upstreamCount} cacheHits=${cacheHitCount}`)

			return new Response(jsonBody, {
				headers: {
					'Content-Type': 'application/json',
					'X-Cache': 'MISS',
					'X-Request-Count': String(requestCount),
					'X-Upstream-Count': String(upstreamCount),
					'X-Cache-Hit-Count': String(cacheHitCount),
					...corsHeaders
				}
			})

		} catch (error) {
			// ── UPSTREAM FAILED → use fallback data
			console.log(`[ERROR] matchId=${matchId} error=${error.message} — using fallback`)

			const fallbackData = getFallbackData(matchId)
			const fallbackBody = JSON.stringify(fallbackData)

			// Store fallback in cache (unless nocache)
			if (!noCache) {
				const cacheResponse = new Response(fallbackBody, {
					headers: { 'Cache-Control': `public, max-age=30` }  // shorter TTL for fallback
				})
				ctx.waitUntil(cache.put(cacheKey, cacheResponse.clone()))
				console.log(`[CACHE SET] matchId=${matchId} TTL=30s (fallback data)`)
			}

			return new Response(fallbackBody, {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
					'X-Cache': 'FALLBACK',
					'X-Request-Count': String(requestCount),
					'X-Upstream-Count': String(upstreamCount),
					'X-Cache-Hit-Count': String(cacheHitCount),
					...corsHeaders
				}
			})
		}
	}
}
