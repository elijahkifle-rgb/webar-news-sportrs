// main.js
import { initMarkerTracking } from './arsession.js'

// ── 1. Read matchId from URL ──────────────────────────────────────────────────
const params  = new URLSearchParams(window.location.search)
const matchId = params.get('id') || '552077'

// ── 2. Worker URL from .env ───────────────────────────────────────────────────
const WORKER_URL = import.meta.env.VITE_WORKER_URL

// ── 3. State ──────────────────────────────────────────────────────────────────
let matchData = null

// ── 4. Fetch match data ───────────────────────────────────────────────────────
async function loadMatchData() {
    try {
        document.getElementById('loading-text').textContent = 'Fetching match...'

        const response = await fetch(`${WORKER_URL}/api/${matchId}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const data = await response.json()
        console.log('Match data:', data)

        matchData = {
            fixture: {
                fixture: { id: matchId, status: { short: data.period, elapsed: data.minute } },
                teams: {
                    home: { id: 1, name: data.homeTeam },
                    away: { id: 2, name: data.awayTeam }
                },
                goals: { home: data.home, away: data.away }
            },
            homeLineup: getMockLineup(data.homeTeam, 1),
            awayLineup: getMockLineup(data.awayTeam, 2),
            stats: []
        }

        updateUI()

    } catch (err) {
        console.error('Failed to load match data:', err)
        matchData = getMockData()
        updateUI()
    }
}

// ── 5. Update UI ──────────────────────────────────────────────────────────────
function updateUI() {
    const { fixture, homeLineup, awayLineup } = matchData
    const homeName  = fixture.teams.home.name
    const awayName  = fixture.teams.away.name
    const homeGoals = fixture.goals.home ?? 0
    const awayGoals = fixture.goals.away ?? 0
    const elapsed   = fixture.fixture.status.elapsed

    // HTML overlay
    document.getElementById('ui-home').textContent = homeName
    document.getElementById('ui-away').textContent = awayName
    document.getElementById('score').textContent   = `${homeGoals} - ${awayGoals}`

    // AR 3D text anchored to marker
    document.getElementById('ar-home').setAttribute('value', homeName)
    document.getElementById('ar-away').setAttribute('value', awayName)
    document.getElementById('ar-score').setAttribute('value', `${homeGoals} - ${awayGoals}`)
    document.getElementById('ar-status').setAttribute('value', elapsed ? `${elapsed}'` : 'FT')

    // Build player list
    buildPlayerList(homeLineup, awayLineup, homeName, awayName)

    // Hide loading screen
    document.getElementById('loading').style.display = 'none'
}

// ── 6. Build player list ──────────────────────────────────────────────────────
const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 }

function buildPlayerList(homePlayers, awayPlayers, homeName, awayName) {
    const list = document.getElementById('player-list')
    list.innerHTML = ''

    // Home team header
    const homeHeader = document.createElement('p')
    homeHeader.textContent = homeName
    homeHeader.style.cssText = 'color:#4cc9f0; font-size:12px; font-weight:bold; margin:6px 0 4px; text-transform:uppercase; letter-spacing:0.08em;'
    list.appendChild(homeHeader)

    const sortedHome = [...homePlayers].sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos])
    sortedHome.forEach(p => list.appendChild(makePlayerBtn(p)))

    // Away team header
    const awayHeader = document.createElement('p')
    awayHeader.textContent = awayName
    awayHeader.style.cssText = 'color:#f4a261; font-size:12px; font-weight:bold; margin:10px 0 4px; text-transform:uppercase; letter-spacing:0.08em;'
    list.appendChild(awayHeader)

    const sortedAway = [...awayPlayers].sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos])
    sortedAway.forEach(p => list.appendChild(makePlayerBtn(p)))
}

function makePlayerBtn(player) {
    const btn = document.createElement('button')
    btn.className = 'player-btn'
    btn.innerHTML = `
        <span>${player.number} &nbsp; ${player.name}</span>
        <span style="opacity:0.5; font-size:12px;">${player.pos}</span>
    `
    btn.addEventListener('click', () => showPlayerStats(player))
    return btn
}

// ── 7. Player stats popup ─────────────────────────────────────────────────────
function showPlayerStats(player) {
    const stats = matchData.stats.find(s => s.playerId === player.id)

    document.getElementById('stats-name').textContent = `#${player.number} ${player.name}`

    const rows = [
        ['Minutes',      stats?.minutes       ?? '-'],
        ['Rating',       stats?.rating        ?? '-'],
        ['Goals',        stats?.goals         ?? 0],
        ['Assists',      stats?.assists       ?? 0],
        ['Shots',        stats?.shots         ?? 0],
        ['On target',    stats?.shotsOnTarget ?? 0],
        ['Passes',       stats?.passes        ?? 0],
        ['Pass acc.',    stats?.passAccuracy  ?? '-'],
        ['Tackles',      stats?.tackles       ?? 0],
        ['Fouls',        stats?.fouls         ?? 0],
        ['Yellow cards', stats?.yellowCards   ?? 0],
        ['Red cards',    stats?.redCards      ?? 0],
    ]

    const container = document.getElementById('stats-rows')
    container.innerHTML = rows.map(([label, value]) => `
        <div class="stat-row">
            <span class="stat-label">${label}</span>
            <span class="stat-value">${value}</span>
        </div>
    `).join('')

    document.getElementById('stats-popup').style.display  = 'block'
    document.getElementById('player-panel').style.display = 'none'
}

document.getElementById('close-stats').addEventListener('click', () => {
    document.getElementById('stats-popup').style.display  = 'none'
    document.getElementById('player-panel').style.display = 'block'
})

// ── 8. Marker tracking ────────────────────────────────────────────────────────
initMarkerTracking(
    () => {
        document.getElementById('scan-hint').style.display    = 'none'
        document.getElementById('player-panel').style.display = 'block'
    },
    () => {
        document.getElementById('scan-hint').style.display    = 'block'
        document.getElementById('player-panel').style.display = 'none'
        document.getElementById('stats-popup').style.display  = 'none'
    }
)

// ── 9. Start ──────────────────────────────────────────────────────────────────
loadMatchData()

// ── 10. Mock lineup (used until company provides API-Football access) ──────────
function getMockLineup(teamName, teamId) {
    return [
        { id: teamId * 100 + 1,  name: 'Goalkeeper',   number: 1,  pos: 'G', teamId },
        { id: teamId * 100 + 2,  name: 'Defender 1',   number: 2,  pos: 'D', teamId },
        { id: teamId * 100 + 3,  name: 'Defender 2',   number: 5,  pos: 'D', teamId },
        { id: teamId * 100 + 4,  name: 'Defender 3',   number: 6,  pos: 'D', teamId },
        { id: teamId * 100 + 5,  name: 'Defender 4',   number: 3,  pos: 'D', teamId },
        { id: teamId * 100 + 6,  name: 'Midfielder 1', number: 4,  pos: 'M', teamId },
        { id: teamId * 100 + 7,  name: 'Midfielder 2', number: 8,  pos: 'M', teamId },
        { id: teamId * 100 + 8,  name: 'Midfielder 3', number: 10, pos: 'M', teamId },
        { id: teamId * 100 + 9,  name: 'Forward 1',    number: 7,  pos: 'F', teamId },
        { id: teamId * 100 + 10, name: 'Forward 2',    number: 9,  pos: 'F', teamId },
        { id: teamId * 100 + 11, name: 'Forward 3',    number: 11, pos: 'F', teamId },
    ]
}

// ── 11. Full mock fallback (if Worker fails completely) ───────────────────────
function getMockData() {
    return {
        fixture: {
            fixture: { id: 552077, status: { short: 'TIMED', elapsed: 0 } },
            teams: {
                home: { id: 1, name: 'Liverpool FC' },
                away: { id: 2, name: 'Galatasaray SK' }
            },
            goals: { home: 0, away: 0 }
        },
        homeLineup: getMockLineup('Liverpool FC', 1),
        awayLineup: getMockLineup('Galatasaray SK', 2),
        stats: []
    }
}