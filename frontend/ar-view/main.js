// main.js
import { initMarkerTracking } from './arsession.js'

// Read matchId from URL
const params  = new URLSearchParams(window.location.search)
const matchId = params.get('id') || '552077'

let WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
WORKER_URL = WORKER_URL.replace(/,$/, '');
let matchData = null

// Fetch match data
async function loadMatchData() {
    try {
        document.getElementById('loading-text').textContent = 'Fetching match…'
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
            homeLineup: data.homeLineup?.length ? data.homeLineup : getMockLineup(data.homeTeam, 1),
            awayLineup: data.awayLineup?.length ? data.awayLineup : getMockLineup(data.awayTeam, 2),
            stats: []
        }
        updateUI()
    } catch (err) {
        console.error('Failed to load match data:', err)
        matchData = getMockData()
        updateUI()
    }
}

// Update UI
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

    // AR 3D text entities
    document.getElementById('ar-home').setAttribute('value', homeName)
    document.getElementById('ar-away').setAttribute('value', awayName)
    document.getElementById('ar-score').setAttribute('value', `${homeGoals} - ${awayGoals}`)
    document.getElementById('ar-status').setAttribute('value', elapsed ? `${elapsed}'` : 'FT')

    // Build player list
    buildPlayerList(homeLineup, awayLineup, homeName, awayName)
    document.getElementById('loading').style.display = 'none'
}

// Player list
const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 }

function buildPlayerList(homePlayers, awayPlayers, homeName, awayName) {
    const list = document.getElementById('player-list')
    list.innerHTML = ''

    // Home header
    const homeHeader = document.createElement('p')
    homeHeader.className = 'team-header home'
    homeHeader.textContent = homeName
    list.appendChild(homeHeader)

    const sortedHome = [...homePlayers].sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos])
    sortedHome.forEach(p => list.appendChild(makePlayerBtn(p)))

    // Away header
    const awayHeader = document.createElement('p')
    awayHeader.className = 'team-header away'
    awayHeader.textContent = awayName
    list.appendChild(awayHeader)

    const sortedAway = [...awayPlayers].sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos])
    sortedAway.forEach(p => list.appendChild(makePlayerBtn(p)))
}

function makePlayerBtn(player) {
    const btn = document.createElement('button')
    btn.className = 'player-btn'
    btn.innerHTML = `
        <div class="player-info">
            <span class="player-number">${player.number}</span>
            <span class="player-name">${player.name}</span>
        </div>
        <span class="player-pos">${player.pos}</span>
    `
    btn.addEventListener('click', () => showPlayerStats(player))
    return btn
}

// Player stats popup — now uses grid cards
function showPlayerStats(player) {
    const stats = matchData.stats.find(s => s.playerId === player.id)

    document.getElementById('stats-name').textContent = `#${player.number} ${player.name}`

    const rows = [
        ['Minutes',    stats?.minutes       ?? '—'],
        ['Rating',     stats?.rating        ?? '—'],
        ['Goals',      stats?.goals         ?? 0  ],
        ['Assists',    stats?.assists       ?? 0  ],
        ['Shots',      stats?.shots         ?? 0  ],
        ['On target',  stats?.shotsOnTarget ?? 0  ],
        ['Passes',     stats?.passes        ?? 0  ],
        ['Pass acc.',  stats?.passAccuracy  ?? '—'],
        ['Tackles',    stats?.tackles       ?? 0  ],
        ['Fouls',      stats?.fouls         ?? 0  ],
        ['Yellow',     stats?.yellowCards   ?? 0  ],
        ['Red',        stats?.redCards      ?? 0  ],
    ]

    const container = document.getElementById('stats-rows')
    container.innerHTML = rows.map(([label, value]) => `
        <div class="stat-card">
            <span class="stat-label">${label}</span>
            <span class="stat-value">${value}</span>
        </div>
    `).join('')

    document.getElementById('stats-popup').style.display  = 'flex'
    document.getElementById('player-panel').style.display = 'none'
}

document.getElementById('close-stats').addEventListener('click', () => {
    document.getElementById('stats-popup').style.display  = 'none'
    if (currentMode === 'stats') {
        document.getElementById('player-panel').style.display = 'flex'
    }
})

// Mode toggle
let currentMode = 'ar'

document.getElementById('btn-ar').addEventListener('click', () => {
    currentMode = 'ar'
    document.getElementById('btn-ar').classList.add('active')
    document.getElementById('btn-stats').classList.remove('active')
    document.getElementById('scan-hint').style.display = 'block'
    document.getElementById('player-panel').style.display = 'none'
    document.getElementById('stats-popup').style.display = 'none'
})

document.getElementById('btn-stats').addEventListener('click', () => {
    currentMode = 'stats'
    document.getElementById('btn-stats').classList.add('active')
    document.getElementById('btn-ar').classList.remove('active')
    document.getElementById('scan-hint').style.display = 'none'
    document.getElementById('player-panel').style.display = 'flex'
    document.getElementById('stats-popup').style.display = 'none'
})

// Marker tracking
initMarkerTracking(
    () => {
        if (currentMode !== 'ar') return
        document.getElementById('scan-hint').style.display    = 'none'
        document.getElementById('player-panel').style.display = 'flex'
    },
    () => {
        if (currentMode !== 'ar') return
        document.getElementById('scan-hint').style.display    = 'block'
        document.getElementById('player-panel').style.display = 'none'
        document.getElementById('stats-popup').style.display  = 'none'
    }
)

// Start
loadMatchData()

// Mock lineup
function getMockLineup(teamName, teamId) {
    return [
        { id: teamId*100+1,  name: 'Goalkeeper',   number: 1,  pos: 'G', teamId },
        { id: teamId*100+2,  name: 'Defender 1',   number: 2,  pos: 'D', teamId },
        { id: teamId*100+3,  name: 'Defender 2',   number: 5,  pos: 'D', teamId },
        { id: teamId*100+4,  name: 'Defender 3',   number: 6,  pos: 'D', teamId },
        { id: teamId*100+5,  name: 'Defender 4',   number: 3,  pos: 'D', teamId },
        { id: teamId*100+6,  name: 'Midfielder 1', number: 4,  pos: 'M', teamId },
        { id: teamId*100+7,  name: 'Midfielder 2', number: 8,  pos: 'M', teamId },
        { id: teamId*100+8,  name: 'Midfielder 3', number: 10, pos: 'M', teamId },
        { id: teamId*100+9,  name: 'Forward 1',    number: 7,  pos: 'F', teamId },
        { id: teamId*100+10, name: 'Forward 2',    number: 9,  pos: 'F', teamId },
        { id: teamId*100+11, name: 'Forward 3',    number: 11, pos: 'F', teamId },
    ]
}

// Full mock fallback
function getMockData() {
    return {
        fixture: {
            fixture: { id: 552077, status: { short: 'FT', elapsed: 90 } },
            teams: {
                home: { id: 1, name: 'Liverpool FC' },
                away: { id: 2, name: 'Galatasaray SK' }
            },
            goals: { home: 4, away: 0 }
        },
        homeLineup: getMockLineup('Liverpool FC', 1),
        awayLineup: getMockLineup('Galatasaray SK', 2),
        stats: []
    }
}