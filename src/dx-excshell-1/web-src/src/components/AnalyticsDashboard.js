/*
* <license header>
*/

import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import {
  View,
  Flex,
  Heading,
  Content,
  Picker,
  Item,
  Button,
  ProgressCircle,
  InlineAlert,
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  IllustratedMessage,
  Text
} from '@adobe/react-spectrum'
import NotFound from '@spectrum-icons/illustrations/NotFound'

import allActions from '../config.json'
import actionWebInvoke from '../utils'

// Resolve the deployed analytics action URL from config.json (CLI/sandbox fill this in).
const analyticsUrl =
  allActions.analytics ||
  allActions[Object.keys(allActions).find((k) => k.endsWith('/analytics')) || '']

// Supported relative date ranges for the report.
const DATE_RANGES = [
  { id: '7', name: 'Last 7 days' },
  { id: '30', name: 'Last 30 days' },
  { id: '90', name: 'Last 90 days' }
]

// Returns { startDate, endDate } as YYYY-MM-DD for the trailing N days (endDate = today).
function rangeToDates (days) {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - (Number(days) - 1))
  const fmt = (d) => d.toISOString().slice(0, 10)
  return { startDate: fmt(start), endDate: fmt(end) }
}

const numberFmt = new Intl.NumberFormat()

const AnalyticsDashboard = (props) => {
  const [suites, setSuites] = useState([])
  const [selectedSuite, setSelectedSuite] = useState(null)
  const [selectedRange, setSelectedRange] = useState('7')
  const [report, setReport] = useState(null)

  const [suitesLoading, setSuitesLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(false)
  const [error, setError] = useState(null)

  // Build the request headers (IMS token + org) once per render.
  function authHeaders () {
    const headers = {}
    if (props.ims.token) headers.authorization = `Bearer ${props.ims.token}`
    if (props.ims.org) headers['x-gw-ims-org-id'] = props.ims.org
    return headers
  }

  // On load: fetch the available report suites and populate the picker.
  useEffect(() => {
    let cancelled = false
    async function loadSuites () {
      setSuitesLoading(true)
      setError(null)
      if (!analyticsUrl) {
        setSuitesLoading(false)
        setError('Backend action URL is not available yet. Deploy the app (or start the preview) to load report suites.')
        return
      }
      try {
        const res = await actionWebInvoke(analyticsUrl, authHeaders(), {})
        if (cancelled) return
        setSuites(res.suites || [])
      } catch (e) {
        if (cancelled) return
        console.error(e)
        setError(`Failed to load report suites: ${e.message}`)
      } finally {
        if (!cancelled) setSuitesLoading(false)
      }
    }
    loadSuites()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the report for the selected suite + date range.
  async function loadReport () {
    if (!selectedSuite) return
    setReportLoading(true)
    setError(null)
    setReport(null)
    try {
      const { startDate, endDate } = rangeToDates(selectedRange)
      const res = await actionWebInvoke(analyticsUrl, authHeaders(), {
        rsid: selectedSuite,
        startDate,
        endDate
      })
      setReport(res)
    } catch (e) {
      console.error(e)
      setError(`Failed to load report: ${e.message}`)
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <View>
      <Heading level={1}>Adobe Analytics Dashboard</Heading>
      <Content marginBottom="size-200">
        Select a report suite and date range to view daily traffic metrics.
      </Content>

      {error && (
        <InlineAlert variant="negative" marginBottom="size-200">
          <Heading>Error</Heading>
          <Content>{error}</Content>
        </InlineAlert>
      )}

      {suitesLoading ? (
        <Flex alignItems="center" justifyContent="center" height="size-3000">
          <ProgressCircle aria-label="Loading report suites" isIndeterminate size="L" />
        </Flex>
      ) : (
        <Flex direction="row" gap="size-200" alignItems="end" wrap marginBottom="size-300">
          <Picker
            label="Report suite"
            placeholder="Select a report suite"
            items={suites.map((s) => ({ id: s.rsid, name: s.name }))}
            selectedKey={selectedSuite}
            onSelectionChange={(key) => setSelectedSuite(key)}
            width="size-3600"
          >
            {(item) => <Item key={item.id}>{item.name}</Item>}
          </Picker>

          <Picker
            label="Date range"
            items={DATE_RANGES}
            selectedKey={selectedRange}
            onSelectionChange={(key) => setSelectedRange(key)}
            width="size-2400"
          >
            {(item) => <Item key={item.id}>{item.name}</Item>}
          </Picker>

          <Button
            variant="accent"
            onPress={loadReport}
            isDisabled={!selectedSuite || reportLoading}
            isPending={reportLoading}
          >
            Load Report
          </Button>
        </Flex>
      )}

      {reportLoading && (
        <Flex alignItems="center" justifyContent="center" height="size-3000">
          <ProgressCircle aria-label="Loading report" isIndeterminate size="L" />
        </Flex>
      )}

      {!reportLoading && report && (
        <View>
          {/* KPI summary tiles */}
          <Flex direction="row" gap="size-200" wrap marginBottom="size-300">
            {[
              { label: 'Page Views', value: report.totals?.pageViews },
              { label: 'Visits', value: report.totals?.visits },
              { label: 'Visitors', value: report.totals?.visitors }
            ].map((kpi) => (
              <View
                key={kpi.label}
                backgroundColor="gray-100"
                borderRadius="medium"
                padding="size-200"
                width="size-2400"
              >
                <Text>{kpi.label}</Text>
                <Heading level={2} margin="size-0">
                  {numberFmt.format(kpi.value || 0)}
                </Heading>
              </View>
            ))}
          </Flex>

          <TableView aria-label="Daily analytics report" density="compact">
            <TableHeader>
              <Column key="date">Date</Column>
              <Column key="pageViews" align="end">Page Views</Column>
              <Column key="visits" align="end">Visits</Column>
              <Column key="visitors" align="end">Visitors</Column>
            </TableHeader>
            <TableBody
              items={report.rows || []}
              renderEmptyState={() => (
                <IllustratedMessage>
                  <NotFound />
                  <Heading>No data</Heading>
                  <Content>No metrics were returned for this suite and date range.</Content>
                </IllustratedMessage>
              )}
            >
              {(item) => (
                <Row key={item.key}>
                  <Cell>{item.date}</Cell>
                  <Cell>{numberFmt.format(item.pageViews || 0)}</Cell>
                  <Cell>{numberFmt.format(item.visits || 0)}</Cell>
                  <Cell>{numberFmt.format(item.visitors || 0)}</Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </View>
      )}
    </View>
  )
}

AnalyticsDashboard.propTypes = {
  runtime: PropTypes.any,
  ims: PropTypes.any
}

export default AnalyticsDashboard
