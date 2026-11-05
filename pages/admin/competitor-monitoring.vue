<template>
  <div class="monitor-page">
    <div class="monitor-container">
      <header class="page-header">
        <div class="header-content">
          <div class="eyebrow">
            <span class="status-dot"></span>
            LOOPCV INTERNAL TOOLS
          </div>
          <h1>Competitor Monitoring</h1>
          <p>Track competitor SEO activity, discover new pages and monitor content changes.</p>
        </div>

        <button class="refresh-button" :disabled="loading" @click="loadData">
          <span :class="{ spinning: loading }">↻</span>
          {{ loading ? 'Refreshing...' : 'Refresh data' }}
        </button>
      </header>

      <div v-if="loading" class="state-card">
        <div class="loader"></div>
        <p>Loading competitor monitoring data...</p>
      </div>

      <div v-else-if="error" class="state-card error-state">
        <span class="state-icon">!</span>
        <h3>Unable to load monitoring data</h3>
        <p>{{ error }}</p>
        <button class="retry-button" @click="loadData">Try again</button>
      </div>

      <template v-else>
        <section class="overview-section">
          <div class="section-heading">
            <div>
              <span class="section-label">OVERVIEW</span>
              <h2>Monitoring summary</h2>
            </div>
            <span class="updated-label">
              Last scan: {{ formatDate(data.lastChecked) }}
            </span>
          </div>

          <div class="overview-grid">
            <div class="stat-card primary-stat">
              <div class="stat-top">
                <span>Total SEO pages</span>
                <span class="stat-icon blue-icon">↗</span>
              </div>
              <strong>{{ formatNumber(totalUrls) }}</strong>
              <span class="stat-description">Pages currently monitored</span>
            </div>

            <div class="stat-card">
              <div class="stat-top">
                <span>New SEO pages</span>
                <span class="stat-icon green-icon">+</span>
              </div>
              <strong>{{ formatNumber(totalNewSeo) }}</strong>
              <span class="stat-description">Discovered in the latest scan</span>
            </div>

            <div class="stat-card">
              <div class="stat-top">
                <span>Competitors</span>
                <span class="stat-icon purple-icon">◎</span>
              </div>
              <strong>{{ competitors.length }}</strong>
              <span class="stat-description">Active monitoring sources</span>
            </div>

            <div class="stat-card">
              <div class="stat-top">
                <span>Sitemap errors</span>
                <span class="stat-icon" :class="totalErrors ? 'red-icon' : 'green-icon'">
                  {{ totalErrors ? '!' : '✓' }}
                </span>
              </div>
              <strong>{{ totalErrors }}</strong>
              <span class="stat-description">
                {{ totalErrors ? 'Issues reported during scanning' : 'No reported sitemap errors' }}
              </span>
            </div>
          </div>
        </section>

        <section class="competitors-section">
          <div class="section-heading">
            <div>
              <span class="section-label">COMPETITOR SOURCES</span>
              <h2>Tracked competitors</h2>
            </div>
            <span class="source-count">{{ competitors.length }} sources</span>
          </div>

          <div
            v-for="competitor in competitors"
            :key="competitor.id"
            class="competitor-card"
          >
            <div class="competitor-overview">
              <div class="competitor-top">
                <div class="competitor-identity">
                  <div class="competitor-logo" :class="'logo-' + competitor.id">
                    {{ competitor.initial }}
                  </div>
                  <div>
                    <h3>{{ competitor.name }}</h3>
                    <a
                      :href="'https://' + competitor.domain"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ competitor.domain }} ↗
                    </a>
                  </div>
                </div>

                <div class="competitor-status">
                  <span
                    class="status-indicator"
                    :class="{ 'status-pending': !data.competitors[competitor.id] }"
                  ></span>
                  {{ data.competitors[competitor.id] ? 'Monitoring' : 'Not yet scanned' }}
                </div>
              </div>

              <div class="competitor-stats">
                <div class="competitor-stat">
                  <span>Total SEO pages</span>
                  <strong>{{ formatNumber(getCompetitorTotal(competitor.id)) }}</strong>
                </div>
                <div class="competitor-stat">
                  <span>New pages</span>
                  <strong class="new-count">
                    {{ formatNumber(getCompetitorNew(competitor.id)) }}
                  </strong>
                </div>
                <div class="competitor-stat">
                  <span>Sitemaps checked</span>
                  <strong>{{ getSitemapsChecked(competitor.id) }}</strong>
                </div>
              </div>
            </div>

            <div class="competitor-pages">
              <div class="category-header">
                <div>
                  <h4>SEO pages</h4>
                  <p>Explore discovered, monitored and removed URLs.</p>
                </div>
                <span class="page-count">
                  {{ formatNumber(getCompetitorTotal(competitor.id)) }} URLs
                </span>
              </div>

              <div class="tabs">
                <button
                  :class="{ active: getTab(competitor.id) === 'new' }"
                  @click="setTab(competitor.id, 'new')"
                >
                  New discoveries
                  <span>{{ getNewUrls(competitor.id).length }}</span>
                </button>

                <button
                  :class="{ active: getTab(competitor.id) === 'previous' }"
                  @click="setTab(competitor.id, 'previous')"
                >
                  Previously detected
                  <span>{{ getPreviousUrls(competitor.id).length }}</span>
                </button>

                <button
                  :class="{ active: getTab(competitor.id) === 'all' }"
                  @click="setTab(competitor.id, 'all')"
                >
                  All pages
                  <span>{{ getUrls(competitor.id).length }}</span>
                </button>

                <button
                  :class="{ active: getTab(competitor.id) === 'removed' }"
                  @click="setTab(competitor.id, 'removed')"
                >
                  Removed pages
                  <span>{{ getRemovedUrls(competitor.id).length }}</span>
                </button>
              </div>

              <div class="url-list">
                <div
                  v-for="item in getVisibleUrls(competitor.id)"
                  :key="getUrlItemKey(item)"
                  class="url-item"
                >
                  <div class="url-content">
                    <div class="url-indicator"></div>
                    <div class="url-details">
                      <a
                        :href="item.url"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {{ item.url }}
                      </a>
                      <div class="url-meta">
                        <span v-if="getTab(competitor.id) === 'removed'">
                          Removed from sitemap:
                          {{ formatDate(getHistoryDate(item)) }}
                        </span>
                        <span v-else>
                          First detected: {{ formatDate(item.firstSeen) }}
                        </span>
                        <span v-if="item.category">
                          Category: {{ item.category }}
                        </span>
                        <span v-if="item.lastmod && getTab(competitor.id) !== 'removed'">
                          Last modified: {{ formatDate(item.lastmod) }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <a
                    class="open-url"
                    :href="item.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open page"
                  >
                    ↗
                  </a>
                </div>

                <div
                  v-if="!getVisibleUrls(competitor.id).length"
                  class="empty-list"
                >
                  <span class="empty-icon">
                    {{ getTab(competitor.id) === 'new' ? '✓' : '○' }}
                  </span>
                  <strong>{{ getEmptyTitle(competitor.id) }}</strong>
                  <p>{{ getEmptyMessage(competitor.id) }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="totalErrors" class="errors-section">
          <div class="section-heading">
            <div>
              <span class="section-label">SCAN REPORT</span>
              <h2>Sitemap issues</h2>
            </div>
          </div>

          <div
            v-for="competitor in competitors"
            :key="competitor.id + '-errors'"
          >
            <div
              v-for="(issue, index) in getSitemapErrors(competitor.id)"
              :key="competitor.id + '-' + index"
              class="error-item"
            >
              <span class="error-icon">!</span>
              <div>
                <strong>{{ competitor.name }}</strong>
                <p>{{ issue }}</p>
              </div>
            </div>
          </div>
        </section>

        <footer class="page-footer">
          <span>LOOPCV COMPETITOR MONITORING</span>
          <span>SEO monitoring dashboard</span>
        </footer>
      </template>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      loading: true,
      error: '',
      data: {
        lastChecked: null,
        competitors: {},
        history: []
      },
      activeTabs: {}
    }
  },

  computed: {
    competitors() {
      const names = {
        aiapply: { name: 'AIApply', domain: 'aiapply.co', initial: 'A' },
        teal: { name: 'Teal', domain: 'tealhq.com', initial: 'T' },
        lazyapply: { name: 'LazyApply', domain: 'lazyapply.com', initial: 'L' },
        sonara: { name: 'Sonara', domain: 'sonara.ai', initial: 'S' },
        applyblast: { name: 'ApplyBlast', domain: 'applyblast.com', initial: 'A' },
        applyhero: { name: 'ApplyHero', domain: 'applyhero.ai', initial: 'A' },
        simplify: { name: 'Simplify', domain: 'simplify.jobs', initial: 'S' },
        jobscan: { name: 'Jobscan', domain: 'jobscan.co', initial: 'J' },
        jobcopilot: { name: 'JobCopilot', domain: 'jobcopilot.com', initial: 'J' }
      }

      return Object.keys(this.data.competitors || {}).map(id => {
        const entry = this.data.competitors[id] || {}
        const known = names[id] || {}

        return {
          id,
          ...known,
          name: entry.name || known.name || id,
          domain: entry.domain || known.domain || id,
          initial: known.initial || id.charAt(0).toUpperCase()
        }
      })
    },

    totalUrls() {
      return this.competitors.reduce(
        (total, competitor) => total + this.getCompetitorTotal(competitor.id),
        0
      )
    },

    totalNewSeo() {
      return this.competitors.reduce(
        (total, competitor) => total + this.getCompetitorNew(competitor.id),
        0
      )
    },

    totalErrors() {
      return this.competitors.reduce(
        (total, competitor) => total + this.getSitemapErrors(competitor.id).length,
        0
      )
    }
  },

  mounted() {
    this.loadData()
  },

  methods: {
    async loadData() {
      this.loading = true
      this.error = ''

      try {
        const response = await fetch(
          `/data/competitor-monitor.json?t=${Date.now()}`
        )

        if (!response.ok) {
          throw new Error('Could not load competitor monitoring data.')
        }

        const result = await response.json()

        this.data = {
          lastChecked: result.lastChecked || null,
          competitors: result.competitors || {},
          history: Array.isArray(result.history) ? result.history : []
        }
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
      }
    },

    formatNumber(value) {
      return Number(value || 0).toLocaleString()
    },

    formatDate(value) {
      if (!value) return 'N/A'

      const date = new Date(value)

      if (Number.isNaN(date.getTime())) return value

      return date.toLocaleString()
    },

    getTab(competitorId) {
      return this.activeTabs[competitorId] || 'new'
    },

    setTab(competitorId, tab) {
      this.$set(this.activeTabs, competitorId, tab)
    },

    getUrls(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor || !competitor.urls) return []

      return Object.entries(competitor.urls)
        .filter(([, item]) => item.category === 'seoPages')
        .map(([url, item]) => ({ url, ...item }))
        .sort(
          (a, b) =>
            new Date(b.firstSeen || 0) - new Date(a.firstSeen || 0)
        )
    },

    getNewUrls(competitorId) {
      return (this.data.history || [])
        .filter(item =>
          item.competitorId === competitorId &&
          item.category === 'seoPages' &&
          item.status === 'new'
        )
        .map(historyItem => {
          const stored =
            this.data.competitors[competitorId]?.urls?.[historyItem.url] || {}

          const detectedAt = this.getHistoryDate(historyItem)

          return {
            ...stored,
            ...historyItem,
            url: historyItem.url,
            firstSeen: detectedAt || stored.firstSeen || null
          }
        })
        .sort(
          (a, b) =>
            new Date(this.getHistoryDate(b) || 0) -
            new Date(this.getHistoryDate(a) || 0)
        )
    },

    getRemovedUrls(competitorId) {
      return (this.data.history || [])
        .filter(item =>
          item.competitorId === competitorId &&
          item.status === 'removed' &&
          (!item.category || item.category === 'seoPages')
        )
        .map(item => ({ ...item }))
        .sort(
          (a, b) =>
            new Date(this.getHistoryDate(b) || 0) -
            new Date(this.getHistoryDate(a) || 0)
        )
    },

    getHistoryDate(item) {
      return (
        item.detectedAt ||
        item.timestamp ||
        item.date ||
        item.createdAt ||
        null
      )
    },

    getUrlItemKey(item) {
      if (item.status === 'new' || item.status === 'removed') {
        return `${item.url}-${item.status}-${this.getHistoryDate(item) || ''}`
      }

      return `${item.url}-${item.firstSeen || ''}`
    },

    getPreviousUrls(competitorId) {
      const newUrls = new Set(
        this.getNewUrls(competitorId).map(item => item.url)
      )

      return this.getUrls(competitorId).filter(
        item => !newUrls.has(item.url)
      )
    },

    getVisibleUrls(competitorId) {
      const tab = this.getTab(competitorId)

      if (tab === 'new') return this.getNewUrls(competitorId)
      if (tab === 'previous') return this.getPreviousUrls(competitorId)
      if (tab === 'removed') return this.getRemovedUrls(competitorId)

      return this.getUrls(competitorId)
    },

    getEmptyTitle(competitorId) {
      const tab = this.getTab(competitorId)

      if (tab === 'new') return 'No new discoveries'
      if (tab === 'removed') return 'No removed pages'

      return 'No pages found'
    },

    getEmptyMessage(competitorId) {
      const tab = this.getTab(competitorId)

      if (tab === 'new') {
        return 'No new SEO pages have been recorded in the monitoring history.'
      }

      if (tab === 'removed') {
        return 'No SEO pages have been recorded as removed from the monitored sitemaps.'
      }

      return 'There are no URLs available in this view.'
    },

    getCompetitorTotal(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor) return 0

      return competitor.monitoredUrls ?? this.getUrls(competitorId).length
    },

    getTotalNewDiscoveries(competitorId) {
      return (this.data.history || []).filter(item =>
        item.competitorId === competitorId &&
        item.category === 'seoPages' &&
        item.status === 'new'
      ).length
    },

    getCompetitorNew(competitorId) {
      return this.getTotalNewDiscoveries(competitorId)
    },

    getSitemapsChecked(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor) return 0

      return (
        competitor.sitemapCount ??
        competitor.sitemapsChecked ??
        0
      )
    },

    getSitemapErrors(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor) return []

      const errors = competitor.sitemapErrors || competitor.errors || []

      if (Array.isArray(errors)) {
        return errors.map(item =>
          typeof item === 'string'
            ? item
            : item.message || JSON.stringify(item)
        )
      }

      return typeof errors === 'string' && errors
        ? [errors]
        : []
    }
  }
}
</script>

<template>
  <div class="monitor-page">
    <div class="monitor-container">
      <header class="page-header">
        <div class="header-content">
          <div class="eyebrow">
            <span class="status-dot"></span>
            LOOPCV INTERNAL TOOLS
          </div>
          <h1>Competitor Monitoring</h1>
          <p>Track competitor SEO activity, discover new pages and monitor content changes.</p>
        </div>

        <button class="refresh-button" :disabled="loading" @click="loadData">
          <span :class="{ spinning: loading }">↻</span>
          {{ loading ? 'Refreshing...' : 'Refresh data' }}
        </button>
      </header>

      <div v-if="loading" class="state-card">
        <div class="loader"></div>
        <p>Loading competitor monitoring data...</p>
      </div>

      <div v-else-if="error" class="state-card error-state">
        <span class="state-icon">!</span>
        <h3>Unable to load monitoring data</h3>
        <p>{{ error }}</p>
        <button class="retry-button" @click="loadData">Try again</button>
      </div>

      <template v-else>
        <section class="overview-section">
          <div class="section-heading">
            <div>
              <span class="section-label">OVERVIEW</span>
              <h2>Monitoring summary</h2>
            </div>
            <span class="updated-label">
              Last scan: {{ formatDate(data.lastChecked) }}
            </span>
          </div>

          <div class="overview-grid">
            <div class="stat-card primary-stat">
              <div class="stat-top">
                <span>Total SEO pages</span>
                <span class="stat-icon blue-icon">↗</span>
              </div>
              <strong>{{ formatNumber(totalUrls) }}</strong>
              <span class="stat-description">Pages currently monitored</span>
            </div>

            <div class="stat-card">
              <div class="stat-top">
                <span>New SEO pages</span>
                <span class="stat-icon green-icon">+</span>
              </div>
              <strong>{{ formatNumber(totalNewSeo) }}</strong>
              <span class="stat-description">Discovered in the latest scan</span>
            </div>

            <div class="stat-card">
              <div class="stat-top">
                <span>Competitors</span>
                <span class="stat-icon purple-icon">◎</span>
              </div>
              <strong>{{ competitors.length }}</strong>
              <span class="stat-description">Active monitoring sources</span>
            </div>

            <div class="stat-card">
              <div class="stat-top">
                <span>Sitemap errors</span>
                <span class="stat-icon" :class="totalErrors ? 'red-icon' : 'green-icon'">
                  {{ totalErrors ? '!' : '✓' }}
                </span>
              </div>
              <strong>{{ totalErrors }}</strong>
              <span class="stat-description">
                {{ totalErrors ? 'Issues reported during scanning' : 'No reported sitemap errors' }}
              </span>
            </div>
          </div>
        </section>

        <section class="competitors-section">
          <div class="section-heading">
            <div>
              <span class="section-label">COMPETITOR SOURCES</span>
              <h2>Tracked competitors</h2>
            </div>
            <span class="source-count">{{ competitors.length }} sources</span>
          </div>

          <div
            v-for="competitor in competitors"
            :key="competitor.id"
            class="competitor-card"
            :class="{ 'competitor-card-open': isExpanded(competitor.id) }"
          >
            <div class="competitor-top">
              <div
                class="competitor-toggle"
                role="button"
                tabindex="0"
                :aria-expanded="isExpanded(competitor.id)"
                @click="toggleCompetitor(competitor.id)"
                @keydown.enter.prevent="toggleCompetitor(competitor.id)"
                @keydown.space.prevent="toggleCompetitor(competitor.id)"
              >
                <div class="competitor-identity">
                  <div class="competitor-logo" :class="'logo-' + competitor.id">
                    {{ competitor.initial }}
                  </div>
                  <div class="competitor-name-wrap">
                    <h3>{{ competitor.name }}</h3>
                    <span class="competitor-domain">{{ competitor.domain }}</span>
                  </div>
                </div>

                <div class="competitor-activity">
                  <span class="activity-badge activity-new" title="New SEO pages">
                    +{{ formatNumber(getNewUrls(competitor.id).length) }}
                  </span>
                  <span class="activity-badge activity-removed" title="Removed SEO pages">
                    −{{ formatNumber(getRemovedUrls(competitor.id).length) }}
                  </span>
                  <span class="activity-badge activity-modified" title="Modified SEO pages">
                    ~{{ formatNumber(getModifiedUrls(competitor.id).length) }}
                  </span>
                  <span class="competitor-status">
                    <span
                      class="status-indicator"
                      :class="{ 'status-pending': !data.competitors[competitor.id] }"
                    ></span>
                    {{ data.competitors[competitor.id] ? 'Monitoring' : 'Not yet scanned' }}
                  </span>
                  <span class="competitor-chevron" :class="{ rotated: isExpanded(competitor.id) }">⌄</span>
                </div>
              </div>
              <a
                class="competitor-external-link"
                :href="'https://' + competitor.domain"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="'Visit ' + competitor.domain"
              >↗</a>
            </div>

            <div v-if="isExpanded(competitor.id)" class="competitor-details">
            <div class="competitor-stats">
              <div class="competitor-stat">
                <span>Total SEO pages</span>
                <strong>{{ formatNumber(getCompetitorTotal(competitor.id)) }}</strong>
              </div>
              <div class="competitor-stat">
                <span>New pages</span>
                <strong class="new-count">
                  {{ formatNumber(getCompetitorNew(competitor.id)) }}
                </strong>
              </div>
              <div class="competitor-stat">
                <span>Sitemaps checked</span>
                <strong>{{ getSitemapsChecked(competitor.id) }}</strong>
              </div>
            </div>

            <div class="category-header">
              <div>
                <h4>SEO pages</h4>
                <p>Explore discovered, monitored and removed URLs.</p>
              </div>
              <span class="page-count">
                {{ formatNumber(getCompetitorTotal(competitor.id)) }} URLs
              </span>
            </div>

            <div class="tabs">
              <button
                :class="{ active: getTab(competitor.id) === 'new' }"
                @click="setTab(competitor.id, 'new')"
              >
                New discoveries
                <span>{{ getNewUrls(competitor.id).length }}</span>
              </button>

              <button
                :class="{ active: getTab(competitor.id) === 'previous' }"
                @click="setTab(competitor.id, 'previous')"
              >
                Previously detected
                <span>{{ getPreviousUrls(competitor.id).length }}</span>
              </button>

              <button
                :class="{ active: getTab(competitor.id) === 'all' }"
                @click="setTab(competitor.id, 'all')"
              >
                All pages
                <span>{{ getUrls(competitor.id).length }}</span>
              </button>

              <button
                :class="{ active: getTab(competitor.id) === 'removed' }"
                @click="setTab(competitor.id, 'removed')"
              >
                Removed pages
                <span>{{ getRemovedUrls(competitor.id).length }}</span>
              </button>

              <button
                :class="{ active: getTab(competitor.id) === 'modified' }"
                @click="setTab(competitor.id, 'modified')"
              >
                Modified pages
                <span>{{ getModifiedUrls(competitor.id).length }}</span>
              </button>
            </div>

            <div class="url-list">
              <div
                v-for="item in getVisibleUrls(competitor.id)"
                :key="getUrlItemKey(item)"
                class="url-item"
              >
                <div class="url-content">
                  <div class="url-indicator"></div>
                  <div class="url-details">
                    <a
                      :href="item.url"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ item.url }}
                    </a>
                    <div class="url-meta">
                      <span v-if="getTab(competitor.id) === 'removed'">
                        Removed from sitemap:
                        {{ formatDate(getHistoryDate(item)) }}
                      </span>
                      <span v-else-if="getTab(competitor.id) === 'modified'">
                        Content change detected: {{ formatDate(getHistoryDate(item)) }}
                      </span>
                      <span v-else>
                        First detected: {{ formatDate(item.firstSeen) }}
                      </span>
                      <span v-if="item.category">
                        Category: {{ item.category }}
                      </span>
                      <span v-if="item.lastmod && getTab(competitor.id) !== 'removed'">
                        Last modified: {{ formatDate(item.lastmod) }}
                      </span>
                    </div>
                  </div>
                </div>

                <a
                  class="open-url"
                  :href="item.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open page"
                >
                  ↗
                </a>
              </div>

              <div
                v-if="!getVisibleUrls(competitor.id).length"
                class="empty-list"
              >
                <span class="empty-icon">
                  {{ getTab(competitor.id) === 'new' ? '✓' : '○' }}
                </span>
                <strong>{{ getEmptyTitle(competitor.id) }}</strong>
                <p>{{ getEmptyMessage(competitor.id) }}</p>
              </div>
            </div>
            </div>
          </div>
        </section>

        <section v-if="totalErrors" class="errors-section">
          <div class="section-heading">
            <div>
              <span class="section-label">SCAN REPORT</span>
              <h2>Sitemap issues</h2>
            </div>
          </div>

          <div
            v-for="competitor in competitors"
            :key="competitor.id + '-errors'"
          >
            <div
              v-for="(issue, index) in getSitemapErrors(competitor.id)"
              :key="competitor.id + '-' + index"
              class="error-item"
            >
              <span class="error-icon">!</span>
              <div>
                <strong>{{ competitor.name }}</strong>
                <p>{{ issue }}</p>
              </div>
            </div>
          </div>
        </section>

        <footer class="page-footer">
          <span>LOOPCV COMPETITOR MONITORING</span>
          <span>SEO monitoring dashboard</span>
        </footer>
      </template>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      loading: true,
      error: '',
      data: {
        lastChecked: null,
        competitors: {},
        history: []
      },
      activeTabs: {},
      expandedCompetitor: null
    }
  },

  computed: {
    competitors() {
      const names = {
        aiapply: { name: 'AIApply', domain: 'aiapply.co', initial: 'A' },
        teal: { name: 'Teal', domain: 'tealhq.com', initial: 'T' },
        lazyapply: { name: 'LazyApply', domain: 'lazyapply.com', initial: 'L' },
        sonara: { name: 'Sonara', domain: 'sonara.ai', initial: 'S' },
        applyblast: { name: 'ApplyBlast', domain: 'applyblast.com', initial: 'A' },
        applyhero: { name: 'ApplyHero', domain: 'applyhero.ai', initial: 'A' },
        simplify: { name: 'Simplify', domain: 'simplify.jobs', initial: 'S' },
        jobscan: { name: 'Jobscan', domain: 'jobscan.co', initial: 'J' },
        jobcopilot: { name: 'JobCopilot', domain: 'jobcopilot.com', initial: 'J' }
      }

      return Object.keys(this.data.competitors || {}).map(id => {
        const entry = this.data.competitors[id] || {}
        const known = names[id] || {}

        return {
          id,
          ...known,
          name: entry.name || known.name || id,
          domain: entry.domain || known.domain || id,
          initial: known.initial || id.charAt(0).toUpperCase()
        }
      })
    },

    totalUrls() {
      return this.competitors.reduce(
        (total, competitor) => total + this.getCompetitorTotal(competitor.id),
        0
      )
    },

    totalNewSeo() {
      return this.competitors.reduce(
        (total, competitor) => total + this.getCompetitorNew(competitor.id),
        0
      )
    },

    totalErrors() {
      return this.competitors.reduce(
        (total, competitor) => total + this.getSitemapErrors(competitor.id).length,
        0
      )
    }
  },

  mounted() {
    this.loadData()
  },

  methods: {
    async loadData() {
      this.loading = true
      this.error = ''

      try {
        const response = await fetch(
          `/data/competitor-monitor.json?t=${Date.now()}`
        )

        if (!response.ok) {
          throw new Error('Could not load competitor monitoring data.')
        }

        const result = await response.json()

        this.data = {
          lastChecked: result.lastChecked || null,
          competitors: result.competitors || {},
          history: Array.isArray(result.history) ? result.history : []
        }
      } catch (error) {
        this.error = error.message
      } finally {
        this.loading = false
      }
    },

    formatNumber(value) {
      return Number(value || 0).toLocaleString()
    },

    formatDate(value) {
      if (!value) return 'N/A'

      const date = new Date(value)

      if (Number.isNaN(date.getTime())) return value

      return date.toLocaleString()
    },

    isExpanded(competitorId) {
      return this.expandedCompetitor === competitorId
    },

    toggleCompetitor(competitorId) {
      this.expandedCompetitor = this.isExpanded(competitorId)
        ? null
        : competitorId
    },

    getTab(competitorId) {
      return this.activeTabs[competitorId] || 'new'
    },

    setTab(competitorId, tab) {
      this.$set(this.activeTabs, competitorId, tab)
    },

    getUrls(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor || !competitor.urls) return []

      return Object.entries(competitor.urls)
        .filter(([, item]) => item.category === 'seoPages')
        .map(([url, item]) => ({ url, ...item }))
        .sort(
          (a, b) =>
            new Date(b.firstSeen || 0) - new Date(a.firstSeen || 0)
        )
    },

    getNewUrls(competitorId) {
      return (this.data.history || [])
        .filter(item =>
          item.competitorId === competitorId &&
          item.category === 'seoPages' &&
          item.status === 'new'
        )
        .map(historyItem => {
          const stored =
            this.data.competitors[competitorId]?.urls?.[historyItem.url] || {}

          const detectedAt = this.getHistoryDate(historyItem)

          return {
            ...stored,
            ...historyItem,
            url: historyItem.url,
            firstSeen: detectedAt || stored.firstSeen || null
          }
        })
        .sort(
          (a, b) =>
            new Date(this.getHistoryDate(b) || 0) -
            new Date(this.getHistoryDate(a) || 0)
        )
    },

    getRemovedUrls(competitorId) {
      return (this.data.history || [])
        .filter(item =>
          item.competitorId === competitorId &&
          item.status === 'removed' &&
          (!item.category || item.category === 'seoPages')
        )
        .map(item => ({ ...item }))
        .sort(
          (a, b) =>
            new Date(this.getHistoryDate(b) || 0) -
            new Date(this.getHistoryDate(a) || 0)
        )
    },

    getModifiedUrls(competitorId) {
      return (this.data.history || [])
        .filter(item =>
          item.competitorId === competitorId &&
          ['modified', 'changed', 'updated'].includes(item.status) &&
          (!item.category || item.category === 'seoPages')
        )
        .map(historyItem => {
          const stored =
            this.data.competitors[competitorId]?.urls?.[historyItem.url] || {}

          return {
            ...stored,
            ...historyItem,
            url: historyItem.url
          }
        })
        .sort(
          (a, b) =>
            new Date(this.getHistoryDate(b) || 0) -
            new Date(this.getHistoryDate(a) || 0)
        )
    },

    getHistoryDate(item) {
      return (
        item.detectedAt ||
        item.timestamp ||
        item.date ||
        item.createdAt ||
        null
      )
    },

    getUrlItemKey(item) {
      if (item.status === 'new' || item.status === 'removed') {
        return `${item.url}-${item.status}-${this.getHistoryDate(item) || ''}`
      }

      return `${item.url}-${item.firstSeen || ''}`
    },

    getPreviousUrls(competitorId) {
      const newUrls = new Set(
        this.getNewUrls(competitorId).map(item => item.url)
      )

      return this.getUrls(competitorId).filter(
        item => !newUrls.has(item.url)
      )
    },

    getVisibleUrls(competitorId) {
      const tab = this.getTab(competitorId)

      if (tab === 'new') return this.getNewUrls(competitorId)
      if (tab === 'previous') return this.getPreviousUrls(competitorId)
      if (tab === 'removed') return this.getRemovedUrls(competitorId)
      if (tab === 'modified') return this.getModifiedUrls(competitorId)

      return this.getUrls(competitorId)
    },

    getEmptyTitle(competitorId) {
      const tab = this.getTab(competitorId)

      if (tab === 'new') return 'No new discoveries'
      if (tab === 'removed') return 'No removed pages'
      if (tab === 'modified') return 'No modified pages'

      return 'No pages found'
    },

    getEmptyMessage(competitorId) {
      const tab = this.getTab(competitorId)

      if (tab === 'new') {
        return 'No new SEO pages have been recorded in the monitoring history.'
      }

      if (tab === 'removed') {
        return 'No SEO pages have been recorded as removed from the monitored sitemaps.'
      }

      if (tab === 'modified') {
        return 'No existing SEO page changes have been recorded in the monitoring history.'
      }

      return 'There are no URLs available in this view.'
    },

    getCompetitorTotal(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor) return 0

      return competitor.monitoredUrls ?? this.getUrls(competitorId).length
    },

    getTotalNewDiscoveries(competitorId) {
      return (this.data.history || []).filter(item =>
        item.competitorId === competitorId &&
        item.category === 'seoPages' &&
        item.status === 'new'
      ).length
    },

    getCompetitorNew(competitorId) {
      return this.getTotalNewDiscoveries(competitorId)
    },

    getSitemapsChecked(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor) return 0

      return (
        competitor.sitemapCount ??
        competitor.sitemapsChecked ??
        0
      )
    },

    getSitemapErrors(competitorId) {
      const competitor = this.data.competitors[competitorId]

      if (!competitor) return []

      const errors = competitor.sitemapErrors || competitor.errors || []

      if (Array.isArray(errors)) {
        return errors.map(item =>
          typeof item === 'string'
            ? item
            : item.message || JSON.stringify(item)
        )
      }

      return typeof errors === 'string' && errors
        ? [errors]
        : []
    }
  }
}
</script>

<style scoped>
.monitor-page {
  min-height: 100vh;
  padding: 48px 28px 70px;
  background: #f6f8fc;
  color: #172033;
  font-family: inherit;
}

.monitor-container {
  max-width: 1320px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  margin-bottom: 42px;
}

.eyebrow,
.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 1.4px;
}

.status-dot,
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
}

.page-header h1 {
  margin: 12px 0 8px;
  color: #14213d;
  font-size: 34px;
  font-weight: 750;
  letter-spacing: -1.1px;
}

.page-header p {
  margin: 0;
  color: #718096;
  font-size: 14px;
}

.refresh-button,
.retry-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 12px 18px;
  border: 1px solid #dce4f0;
  border-radius: 9px;
  background: #fff;
  color: #26364d;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-button:hover,
.retry-button:hover {
  border-color: #2563eb;
  color: #2563eb;
  box-shadow: 0 3px 10px rgba(37, 99, 235, 0.08);
}

.refresh-button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.refresh-button span {
  font-size: 19px;
  line-height: 1;
}

.spinning {
  animation: spin 1s linear infinite;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 18px;
}

.section-label {
  color: #8a97aa;
  font-size: 10px;
}

.section-heading h2 {
  margin: 7px 0 0;
  color: #1e293b;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

.updated-label,
.source-count {
  color: #8290a4;
  font-size: 12px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  min-width: 0;
  padding: 22px;
  border: 1px solid #e7ebf2;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.025);
}

.stat-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  color: #718096;
  font-size: 12px;
  font-weight: 550;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  font-size: 17px;
  font-weight: 700;
}

.blue-icon {
  background: #edf3ff;
  color: #3973e6;
}

.green-icon {
  background: #eafaf1;
  color: #15945a;
}

.purple-icon {
  background: #f2edff;
  color: #7952d6;
}

.red-icon {
  background: #fff0f0;
  color: #dc4444;
}

.stat-card > strong {
  display: block;
  color: #172033;
  font-size: 29px;
  font-weight: 750;
  letter-spacing: -0.8px;
}

.stat-description {
  display: block;
  margin-top: 7px;
  color: #98a3b3;
  font-size: 11px;
}

.competitors-section {
  margin-top: 45px;
}

.competitor-card {
  overflow: hidden;
  margin-bottom: 22px;
  border: 1px solid #e5eaf2;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.025);
}

.competitor-top {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
}

.competitor-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.competitor-toggle:focus-visible {
  outline: 2px solid #3475e6;
  outline-offset: 5px;
  border-radius: 5px;
}

.competitor-name-wrap {
  min-width: 0;
}

.competitor-domain {
  display: block;
  color: #8995a7;
  font-size: 12px;
}

.competitor-activity {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  flex-shrink: 0;
}

.activity-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 35px;
  padding: 6px 9px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.activity-new {
  background: #eafaf1;
  color: #15945a;
}

.activity-removed {
  background: #fff0f0;
  color: #d74747;
}

.activity-modified {
  background: #edf3ff;
  color: #3475d5;
}

.competitor-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  color: #8995a7;
  font-size: 22px;
  transition: transform 0.2s ease;
}

.competitor-chevron.rotated {
  transform: rotate(180deg);
}

.competitor-external-link {
  flex-shrink: 0;
  color: #8995a7;
  font-size: 16px;
  text-decoration: none;
}

.competitor-external-link:hover {
  color: #2563eb;
}

.competitor-details {
  border-top: 1px solid #edf0f5;
}

.competitor-card-open {
  border-color: #d7e3f7;
  box-shadow: 0 5px 18px rgba(37, 99, 235, 0.055);
}

.competitor-identity {
  display: flex;
  align-items: center;
  gap: 14px;
}

.competitor-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  font-size: 19px;
  font-weight: 750;
}

.logo-aiapply {
  background: #eaf1ff;
  color: #3168d8;
}

.logo-teal {
  background: #e9f8f3;
  color: #138b68;
}

.competitor-identity h3 {
  margin: 0 0 5px;
  color: #1e293b;
  font-size: 17px;
  font-weight: 700;
}

.competitor-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid #d9f1e4;
  border-radius: 20px;
  background: #f1fbf5;
  color: #16824c;
  font-size: 11px;
  font-weight: 650;
}

.competitor-status .status-indicator {
  width: 7px;
  height: 7px;
}

.competitor-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 25px;
  padding: 19px 0;
  border-top: 1px solid #edf0f5;
  border-bottom: 1px solid #edf0f5;
}

.competitor-stat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 20px;
  border-left: 1px solid #edf0f5;
}

.competitor-stat:first-child {
  padding-left: 0;
  border-left: 0;
}

.competitor-stat span {
  color: #8793a5;
  font-size: 11px;
}

.competitor-stat strong {
  color: #243148;
  font-size: 21px;
  font-weight: 750;
}

.competitor-stat .new-count {
  color: #15945a;
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding: 22px 25px 17px;
}

.category-header h4 {
  margin: 0 0 5px;
  color: #263449;
  font-size: 14px;
  font-weight: 700;
}

.category-header p {
  margin: 0;
  color: #98a3b3;
  font-size: 11px;
}

.page-count {
  color: #66758b;
  font-size: 11px;
  font-weight: 650;
}

.tabs {
  display: flex;
  gap: 22px;
  padding: 0 25px;
  border-bottom: 1px solid #edf0f5;
}

.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 12px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8491a4;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition: color 0.2s ease;
}

.tabs button:hover {
  color: #2563eb;
}

.tabs button.active {
  border-bottom-color: #3475e6;
  color: #2868d7;
  font-weight: 700;
}

.tabs button span {
  padding: 3px 7px;
  border-radius: 10px;
  background: #f0f3f8;
  color: #718096;
  font-size: 10px;
}

.tabs button.active span {
  background: #eaf1ff;
  color: #2868d7;
}

.url-list {
  max-height: 420px;
  overflow-y: auto;
}

.url-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding: 15px 25px;
  border-bottom: 1px solid #f0f2f6;
  transition: background 0.15s ease;
}

.url-item:hover {
  background: #fafcff;
}

.url-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.url-indicator {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  margin-top: 6px;
  border-radius: 50%;
  background: #8aadef;
}

.url-details {
  min-width: 0;
}

.url-item a {
  overflow-wrap: anywhere;
  color: #376fc9;
  font-size: 12px;
  line-height: 1.6;
  text-decoration: none;
}

.url-item a:hover {
  color: #174ca6;
  text-decoration: underline;
}

.url-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 6px;
  color: #a0aaba;
  font-size: 10px;
}

.url-item .open-url {
  flex-shrink: 0;
  color: #a0aaba;
  font-size: 16px;
  text-decoration: none;
}

.url-item .open-url:hover {
  color: #2563eb;
  text-decoration: none;
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 30px;
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 35px;
  height: 35px;
  margin-bottom: 12px;
  border-radius: 50%;
  background: #edf8f1;
  color: #15945a;
  font-size: 17px;
}

.empty-list strong {
  color: #425168;
  font-size: 13px;
}

.empty-list p {
  margin: 7px 0 0;
  color: #98a3b3;
  font-size: 11px;
}

.errors-section {
  margin-top: 38px;
}

.error-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
  padding: 15px 18px;
  border: 1px solid #f4dada;
  border-radius: 10px;
  background: #fffafa;
}

.error-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 23px;
  height: 23px;
  border-radius: 50%;
  background: #feecec;
  color: #d74747;
  font-size: 13px;
  font-weight: 750;
}

.error-item strong {
  color: #8f3434;
  font-size: 12px;
}

.error-item p {
  margin: 4px 0 0;
  color: #a66b6b;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: 35px;
  border: 1px solid #e5eaf2;
  border-radius: 14px;
  background: #fff;
  text-align: center;
}

.state-card p {
  color: #8290a4;
  font-size: 13px;
}

.state-card h3 {
  margin: 12px 0 0;
  color: #263449;
}

.loader {
  width: 30px;
  height: 30px;
  border: 3px solid #e7edf7;
  border-top-color: #3475e6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.state-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #fff0f0;
  color: #d74747;
  font-size: 20px;
  font-weight: 700;
}

.retry-button {
  margin-top: 12px;
}

.page-footer {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  margin-top: 48px;
  padding-top: 18px;
  border-top: 1px solid #e4e9f1;
  color: #9aa5b5;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.7px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1000px) {
  .overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 650px) {
  .monitor-page {
    padding: 28px 15px 45px;
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
    margin-bottom: 32px;
  }

  .page-header h1 {
    font-size: 27px;
  }

  .page-header p {
    line-height: 1.6;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .overview-grid {
    gap: 10px;
  }

  .stat-card {
    padding: 15px;
  }

  .stat-card > strong {
    font-size: 24px;
  }

  .stat-top {
    font-size: 11px;
  }

  .stat-description {
    line-height: 1.5;
  }

  .competitor-top {
    padding: 16px;
  }

  .competitor-toggle {
    align-items: flex-start;
    flex-direction: column;
    gap: 13px;
  }

  .competitor-activity {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 7px;
  }

  .competitor-status {
    margin-left: auto;
  }

  .competitor-external-link {
    align-self: flex-start;
    margin-top: 9px;
  }

  .competitor-stats {
    margin: 0 18px;
  }

  .competitor-stat {
    padding-left: 12px;
  }

  .competitor-stat span {
    font-size: 10px;
  }

  .competitor-stat strong {
    font-size: 18px;
  }

  .category-header {
    padding: 18px;
  }

  .tabs {
    gap: 15px;
    padding: 0 18px;
    overflow-x: auto;
  }

  .tabs button {
    flex-shrink: 0;
    font-size: 11px;
  }

  .url-item {
    padding: 14px 18px;
  }

  .competitor-status {
    font-size: 10px;
  }

  .page-footer {
    flex-direction: column;
  }
}
</style>
