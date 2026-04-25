/**
 * k6 test for Cloudflare Worker + football-data.org (free tier: 10 RPM)
 * Run with:
 *   Edge (caching):    k6 run tests/test-cloud-edge.js
 *   Cloud-only (no cache): k6 run -e CLOUD_ONLY=true tests/test-cloud-edge.js
 */

import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';


const MATCH_ID   = 552077;
const WORKER_URL = 'https://football-api-worker.webar-football.workers.dev';
const ORIGIN     = 'https://footar-frontend.pages.dev';

// Read environment variable: set CLOUD_ONLY=true to disable caching
const CLOUD_ONLY = __ENV.CLOUD_ONLY === 'true';

// Custom metrics
const responseTrend = new Trend('response_time_ms');
const errorCount    = new Counter('error_count');
const cacheHitRate  = new Rate('cache_hit');
const cacheMissRate = new Rate('cache_miss');
const cacheFallbackRate = new Rate('cache_fallback');

//build URL with optional nocache
function buildUrl() {
    let url = `${WORKER_URL}/api/${MATCH_ID}`;
    if (CLOUD_ONLY) url += '?nocache=true';
    return url;
}

//  10 requests per minute
export const options = {
    scenarios: {
        cold_start: {
            executor:   'shared-iterations',
            vus:        1,
            iterations: 1,
            startTime:  '0s',
            tags:       { scenario: 'cold_start' }
        },
        warm_start: {
            executor:   'constant-arrival-rate',
            rate:       1,               // 1 request every
            timeUnit:   '12s',     // 12 seconds → 5 requests/minute
            duration:   '60s',
            preAllocatedVUs: 1,
            maxVUs:     1,
            startTime:  '5s',
            tags:       { scenario: 'warm_start' }
        },
        load_test: {
            executor:   'constant-arrival-rate',
            rate:       1,               // 1 request every
            timeUnit:   '6s',            // 6 seconds → 10 requests/minute
            duration:   '60s',
            preAllocatedVUs: 1,
            maxVUs:     1,
            startTime:  '70s',
            tags:       { scenario: 'load_test' }
        }
    },
    thresholds: {
        http_req_duration: ['p(95)<3000'],
        http_req_failed:   ['rate<0.05'],
        ...(CLOUD_ONLY ? {} : { cache_hit: ['rate>0.50'] })
    },
};

// ── Default function
export default function () {
    const url = buildUrl();
    const res = http.get(url, {
        headers: { 'Origin': ORIGIN }
    });

    responseTrend.add(res.timings.duration);

    let body;
    try { body = JSON.parse(res.body); } catch(e) { body = {}; }

    const cacheStatus = res.headers['X-Cache'] || 'UNKNOWN';
    if (cacheStatus === 'HIT') {
        cacheHitRate.add(true);
        cacheMissRate.add(false);
        cacheFallbackRate.add(false);
    } else if (cacheStatus === 'MISS') {
        cacheHitRate.add(false);
        cacheMissRate.add(true);
        cacheFallbackRate.add(false);
    } else if (cacheStatus === 'FALLBACK') {
        cacheHitRate.add(false);
        cacheMissRate.add(false);
        cacheFallbackRate.add(true);
    } else {
        // Unknown cache status – treat as miss
        cacheHitRate.add(false);
        cacheMissRate.add(true);
        cacheFallbackRate.add(false);
    }

    const ok = check(res, {
        'status is 200':        (r) => r.status === 200,
        'has homeTeam field':   () => body.homeTeam !== undefined,
        'has score field':      () => body.home !== undefined,
        'cache header present': (r) => r.headers['X-Cache'] !== undefined,
    });

    if (!ok) errorCount.add(1);

    console.log(`[${CLOUD_ONLY ? 'CLOUD-ONLY' : 'EDGE'}] status=${res.status} cache=${cacheStatus} duration=${Math.round(res.timings.duration)}ms`);
}

// ── Summary export – now includes accurate cache_hit_rate ──────────
export function handleSummary(data) {
    const testMode = CLOUD_ONLY ? 'cloud-only (no cache)' : 'cloud-edge (60s TTL)';

    // Compute cache hit rate only if the metric exists
    let cacheHitPercent = 'N/A';
    if (data.metrics.cache_hit && data.metrics.cache_hit.values.rate !== undefined) {
        cacheHitPercent = (data.metrics.cache_hit.values.rate * 100).toFixed(1) + '%';
    }

    const summary = {
        test: testMode,
        match_id: MATCH_ID,
        timestamp: new Date().toISOString(),
        results: {
            avg_ms:         Math.round(data.metrics.http_req_duration.values.avg),
            min_ms:         Math.round(data.metrics.http_req_duration.values.min),
            med_ms:         Math.round(data.metrics.http_req_duration.values.med),
            max_ms:         Math.round(data.metrics.http_req_duration.values.max),
            p90_ms:         Math.round(data.metrics.http_req_duration.values['p(90)']),
            p95_ms:         Math.round(data.metrics.http_req_duration.values['p(95)']),
            total_requests: data.metrics.http_reqs.values.count,
            error_rate:     (data.metrics.http_req_failed.values.rate * 100).toFixed(2) + '%',
            cache_hit_rate: cacheHitPercent,
            mode:           CLOUD_ONLY ? 'no-cache' : 'edge-cache-60s'
        }
    };

    const filename = CLOUD_ONLY ? 'results-cloud-only.json' : 'results-cloud-edge.json';
    return { [filename]: JSON.stringify(summary, null, 2) };
}