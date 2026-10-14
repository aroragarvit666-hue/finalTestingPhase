/*
* <license header>
*/

jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn()
  }
}))

const { Core } = require('@adobe/aio-sdk')
const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() }
Core.Logger.mockReturnValue(mockLoggerInstance)

// Mock the analytics client factory so the action never hits IMS / the network.
const mockClient = { getCollections: jest.fn(), getReport: jest.fn() }
jest.mock('./../actions/lib/analytics', () => ({
  initAnalytics: jest.fn(async () => ({ client: mockClient }))
}))
const { initAnalytics } = require('./../actions/lib/analytics')

const action = require('./../actions/analytics/index.js')

// The action requires a bearer token (require-adobe-auth is off); include one by default.
const auth = { __ow_headers: { authorization: 'Bearer fake' } }

beforeEach(() => {
  Core.Logger.mockClear()
  mockLoggerInstance.info.mockReset()
  mockLoggerInstance.debug.mockReset()
  mockLoggerInstance.error.mockReset()
  mockClient.getCollections.mockReset()
  mockClient.getReport.mockReset()
  initAnalytics.mockClear()
})

describe('analytics', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function)
  })

  test('missing bearer token -> returns 401', async () => {
    const response = await action.main({})
    expect(response).toEqual({
      error: { statusCode: 401, body: { error: 'missing Authorization bearer token' } }
    })
  })

  test('no rsid -> returns the list of report suites (200)', async () => {
    mockClient.getCollections.mockResolvedValue({
      body: { content: [{ rsid: 'rs1', name: 'Suite One' }, { rsid: 'rs2', name: 'Suite Two' }] }
    })
    const response = await action.main({ ...auth })
    expect(response.statusCode).toBe(200)
    expect(response.body.suites).toEqual([
      { rsid: 'rs1', name: 'Suite One' },
      { rsid: 'rs2', name: 'Suite Two' }
    ])
  })

  test('rsid without date range -> returns 400', async () => {
    const response = await action.main({ ...auth, rsid: 'rs1' })
    expect(response).toEqual({
      error: { statusCode: 400, body: { error: "missing parameter(s) 'startDate, endDate'" } }
    })
  })

  test('rsid + date range -> returns a report with rows and totals (200)', async () => {
    mockClient.getReport.mockResolvedValue({
      body: {
        rows: [
          { itemId: '1', value: '2026-10-01', data: [100, 40, 30] },
          { itemId: '2', value: '2026-10-02', data: [50, 20, 15] }
        ]
      }
    })
    const response = await action.main({ ...auth, rsid: 'rs1', startDate: '2026-10-01', endDate: '2026-10-02' })
    expect(response.statusCode).toBe(200)
    expect(response.body.rows).toHaveLength(2)
    expect(response.body.rows[0]).toEqual({ key: '1', date: '2026-10-01', pageViews: 100, visits: 40, visitors: 30 })
    expect(response.body.totals).toEqual({ pageViews: 150, visits: 60, visitors: 45 })

    // Verify the Analytics 2.0 dateRange filter was built correctly.
    const sentBody = mockClient.getReport.mock.calls[0][0]
    expect(sentBody.rsid).toBe('rs1')
    expect(sentBody.globalFilters[0]).toEqual({
      type: 'dateRange',
      dateRange: '2026-10-01T00:00:00.000/2026-10-02T00:00:00.000'
    })
  })

  test('SDK failure -> returns 500 and logs the error', async () => {
    const fakeError = new Error('rsid not found')
    mockClient.getCollections.mockRejectedValue(fakeError)
    const response = await action.main({ ...auth })
    expect(response).toEqual({
      error: { statusCode: 500, body: { error: 'analytics request failed: rsid not found' } }
    })
    expect(mockLoggerInstance.error).toHaveBeenCalledWith(fakeError)
  })
})
