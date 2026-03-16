/**
 * test-cloud-only.js
 * Baseline performance test — NO caching.
 * Run: k6 run tests/test-cloud-only.js
 */

import http from 'k6/http'
import { sleep, check } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const responseTrend = new Trend('response_time_ms')
const errorCount    = new Counter('error_count')

export const options = {
    scenarios: {

        // Scenario 1: Cold start
        cold_start: {
            executor:   'shared-iterations',
            vus:        1,
            iterations: 1,
            startTime:  '0s',
            tags:       { scenario: 'cold_start' }
        },

        // Scenario 2: Warm requests
        warm_start: {
            executor:   'shared-iterations',
            vus:        1,
            iterations: 5,
            startTime:  '5s',
            tags:       { scenario: 'warm_start' }
        },

        // Scenario 3: Simulated load
        load_test: {
            executor:  'constant-vus',
            vus:       10,
            duration:  '30s',
            startTime: '20s',
            tags:      { scenario: 'load_test' }
        }

    },

    thresholds: {
        http_req_duration: ['p(95)<3000'],
        http_req_failed:   ['rate<0.10'],
    }
}

const MATCH_ID   = 538084
const WORKER_URL = 'https://football-api-worker.webar-football.workers.dev'

export default function () {
    const res = http.get(`${WORKER_URL}/api/${MATCH_ID}`, {
        headers: { 'Origin': 'http://localhost:5173' }
    })

    responseTrend.add(res.timings.duration)

    let body
    try { body = JSON.parse(res.body) } catch(e) { body = {} }

    const ok = check(res, {
        'status is 200':      (r) => r.status === 200,
        'has homeTeam field': () => body.homeTeam !== undefined,
        'has score field':    () => body.home     !== undefined,
    })

    if (!ok) errorCount.add(1)

    sleep(6)
}

export function handleSummary(data) {
    const dur = data.metrics.http_req_duration

    const summary = {
        test:      'cloud-only (no caching)',
        match_id:  MATCH_ID,
        timestamp: new Date().toISOString(),
        results: {
            avg_ms:         Math.round(dur.values.avg),
            min_ms:         Math.round(dur.values.min),
            med_ms:         Math.round(dur.values.med),
            max_ms:         Math.round(dur.values.max),
            p90_ms:         Math.round(dur.values['p(90)']),
            p95_ms:         Math.round(dur.values['p(95)']),
            total_requests: data.metrics.http_reqs.values.count,
            error_rate:     (data.metrics.http_req_failed.values.rate * 100).toFixed(2) + '%',
        }
    }

    return {
        'tests/results-cloud-only.json': JSON.stringify(summary, null, 2),
    }
}