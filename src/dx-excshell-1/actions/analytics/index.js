/*
* <license header>
*/

/**
 * Adobe Analytics action — a single endpoint with two modes:
 *   - No `rsid`                        -> list available report suites (for the UI Picker)
 *   - `rsid` + `startDate` + `endDate` -> run a daily traffic report
 *
 * Dates are `YYYY-MM-DD` strings; the action builds the Analytics 2.0 dateRange filter.
 */

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, getBearerToken, stringParameters } = require('../utils')
const { initAnalytics } = require('../lib/analytics')

async function main (params) {
  const logger = Core.Logger('analytics', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Calling the analytics action')
    logger.debug(stringParameters(params))

    // require-adobe-auth is off (we use S2S creds for Analytics), so guard against
    // anonymous callers here: the ExC Shell UI always sends the user's IMS token.
    if (!getBearerToken(params)) {
      return errorResponse(401, 'missing Authorization bearer token', logger)
    }

    const { client } = await initAnalytics(params)

    // Mode 1: no rsid -> list report suites for the picker
    if (!params.rsid) {
      logger.info('Fetching report suites')
      const res = await client.getCollections({ limit: 100 })
      const suites = (res.body.content || []).map((s) => ({ rsid: s.rsid, name: s.name }))
      logger.info(`200: returning ${suites.length} report suites`)
      return { statusCode: 200, body: { suites } }
    }

    // Mode 2: rsid + date range -> run a daily traffic report
    const missing = ['startDate', 'endDate'].filter((p) => !params[p])
    if (missing.length > 0) {
      return errorResponse(400, `missing parameter(s) '${missing.join(', ')}'`, logger)
    }

    const dateRange = `${params.startDate}T00:00:00.000/${params.endDate}T00:00:00.000`
    logger.info(`Running report for rsid=${params.rsid} range=${dateRange}`)

    const reportBody = {
      rsid: params.rsid,
      globalFilters: [{ type: 'dateRange', dateRange }],
      metricContainer: {
        metrics: [
          { columnId: '0', id: 'metrics/pageviews' },
          { columnId: '1', id: 'metrics/visits' },
          { columnId: '2', id: 'metrics/visitors' }
        ]
      },
      dimension: 'variables/daterangeday',
      settings: { limit: 400, page: 0, nonesBehavior: 'return-nones' }
    }

    const res = await client.getReport(reportBody)
    const report = res.body
    const columns = ['Page Views', 'Visits', 'Visitors']
    const rows = (report.rows || []).map((r) => ({
      key: r.itemId,
      date: r.value,
      pageViews: r.data[0],
      visits: r.data[1],
      visitors: r.data[2]
    }))

    const totals = rows.reduce(
      (acc, r) => ({
        pageViews: acc.pageViews + (r.pageViews || 0),
        visits: acc.visits + (r.visits || 0),
        visitors: acc.visitors + (r.visitors || 0)
      }),
      { pageViews: 0, visits: 0, visitors: 0 }
    )

    logger.info(`200: report returned ${rows.length} rows`)
    return { statusCode: 200, body: { columns, rows, totals } }
  } catch (error) {
    // The aio-lib SDK throws error objects (err.code / err.message / err.sdk.args), not HTTP responses.
    logger.error(error)
    const message = error.message || 'server error'
    return errorResponse(500, `analytics request failed: ${message}`, logger)
  }
}

exports.main = main
