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

        <div class="header-actions">
          <button
            v-if="canManageCompetitors"
            type="button"
            class="add-competitor-button"
            :aria-expanded="showAddCompetitor"
            aria-controls="add-competitor-panel"
            @click="showAddCompetitor = !showAddCompetitor"
          >
            {{ showAddCompetitor ? 'Close form' : '+ Add Competitor' }}
          </button>
          <a v-if="!isLocalDevelopment && !adminAuthenticated" class="add-competitor-button" href="/api/auth/login">
            Sign in with GitHub
          </a>
          <button v-if="!isLocalDevelopment && adminAuthenticated" type="button" class="refresh-button" @click="logoutAdmin">
            Sign out
          </button>
          <button type="button" class="refresh-button" :disabled="loading" @click="loadData">
            <span :class="{ spinning: loading }">↻</span>
            {{ loading ? 'Refreshing...' : 'Refresh data' }}
          </button>
        </div>
      </header>
      <p v-if="authError" class="add-competitor-error-global" role="alert">{{ authError }}</p>
      <section v-if="showAddCompetitor && canManageCompetitors" id="add-competitor-panel" class="add-competitor-panel">
        <div>
          <strong>Add a competitor</strong>
          <p>Add a competitor directly. On localhost changes save to local JSON; on a live site an authorized administrator saves to GitHub and requests a scan.</p>
        </div>
        <form class="add-competitor-form" @submit.prevent="requestCompetitor">
          <label for="new-competitor-name">Competitor name
            <input id="new-competitor-name" v-model.trim="newCompetitor.name" maxlength="80" required placeholder="e.g. Rezi">
          </label>
          <label for="new-competitor-website">Website URL
            <input id="new-competitor-website" v-model.trim="newCompetitor.website" type="url" required placeholder="https://www.rezi.ai">
          </label>
          <label for="new-competitor-sitemap">Sitemap URL (optional)
            <input id="new-competitor-sitemap" v-model.trim="newCompetitor.sitemap" type="url" placeholder="https://www.rezi.ai/sitemap.xml">
          </label>
          <button class="add-competitor-button" type="submit" :disabled="savingCompetitor">{{ savingCompetitor ? 'Saving...' : 'Save Competitor' }}</button>
        </form>
        <p v-if="addCompetitorError" class="add-competitor-error" role="alert">{{ addCompetitorError }}</p>
        <small>New competitors appear as pending until their first successful scan. Existing SEO history is retained when a competitor is removed.</small>
      </section>

      <p v-if="addCompetitorSuccess" class="add-competitor-success" role="status">{{ addCompetitorSuccess }}</p>
      <p v-if="deleteCompetitorError" class="add-competitor-error-global" role="alert">{{ deleteCompetitorError }}</p>

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
                <span class="stat-icon blue-icon">▤</span>
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
                <span class="stat-icon purple-icon">#</span>
              </div>
              <strong>{{ competitors.length }}</strong>
              <span class="stat-description">Active monitoring sources</span>
            </div>

            <div class="stat-card">
              <div class="stat-top">
                <span>Sitemap errors</span>
                <span class="stat-icon" :class="totalErrors ? 'red-icon' : 'green-icon'">
                  <template v-if="totalErrors">!</template>
                  <template v-else>&#10003;</template>
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
                    &#8722;{{ formatNumber(getRemovedUrls(competitor.id).length) }}
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
                  <span class="competitor-chevron" :class="{ rotated: isExpanded(competitor.id) }">&#8250;</span>
                </div>
              </div>
              <a
                class="competitor-external-link"
                :href="'https://' + competitor.domain"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="'Visit ' + competitor.domain"
              >&#8599;</a>
              <button
                v-if="canManageCompetitors"
                type="button"
                class="competitor-delete-button"
                :disabled="removingCompetitorId === competitor.id"
                :aria-label="'Delete ' + competitor.name + ' from monitoring'"
                @click.stop="deleteCompetitor(competitor)"
              >
                {{ removingCompetitorId === competitor.id ? 'Removing...' : 'Delete' }}
              </button>
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
                  &#8599;
                </a>
              </div>

              <div
                v-if="!getVisibleUrls(competitor.id).length"
                class="empty-list"
              >
                <span class="empty-icon">
                  <template v-if="getTab(competitor.id) === 'new'">&#10003;</template>
                  <template v-else>&#8212;</template>
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
        scanId: null,
        competitors: {},
        history: []
      },
      activeTabs: {},
      expandedCompetitor: null,
      showAddCompetitor: false,
      addCompetitorError: '',
      addCompetitorSuccess: '',
      savingCompetitor: false,
      removingCompetitorId: null,
      deleteCompetitorError: '',
      adminAuthenticated: false,
      adminLogin: '',
      authError: '',
      disabledCompetitorIds: [],
      configuredCompetitors: [],
      newCompetitor: { name: '', website: '', sitemap: '' }
    }
  },

  computed: {
    isLocalDevelopment() {
      return import.meta.env.DEV
    },
    canManageCompetitors() {
      return this.isLocalDevelopment || this.adminAuthenticated
    },
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

      const saved = this.configuredCompetitors || []
      const savedMap = Object.fromEntries(saved.map(item => [item.id, item]))
      const ids = new Set([
        ...Object.keys(this.data.competitors || {}),
        ...saved.map(item => item.id)
      ])
      return Array.from(ids)
        .filter(id => !this.disabledCompetitorIds.includes(id))
        .map(id => {
        const entry = this.data.competitors[id] || {}
        const configured = savedMap[id] || {}
        const known = names[id] || {}
        const name = entry.name || configured.name || known.name || id
        return {
          id,
          name,
          domain: entry.domain || configured.domain || known.domain || id,
          initial: known.initial || name.charAt(0).toUpperCase()
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
    if (!this.isLocalDevelopment) this.loadAdminSession()
  },

  methods: {
    async loadAdminSession() {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin',
          cache: 'no-store'
        })
        const status = await response.json()
        if (!response.ok) throw new Error(status.error || 'Admin login is unavailable.')
        this.adminAuthenticated = status.authenticated === true
        this.adminLogin = status.login || ''
      } catch (error) {
        this.adminAuthenticated = false
        this.authError = error.message || 'Could not check admin login.'
      }
    },
    async logoutAdmin() {
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin'
        })
        if (!response.ok) throw new Error('Could not sign out.')
        this.adminAuthenticated = false
        this.adminLogin = ''
        this.showAddCompetitor = false
      } catch (error) {
        this.authError = error.message || 'Could not sign out.'
      }
    },
    async deleteCompetitor(competitor) {
      if (this.removingCompetitorId) return
      const confirmed = window.confirm(
        'Delete ' + competitor.name + ' from monitoring?\n\n' +
        'It will disappear from the dashboard and future scans will stop. ' +
        'Existing SEO history will be preserved.'
      )
      if (!confirmed) return
      this.deleteCompetitorError = ''
      this.addCompetitorSuccess = ''
      this.removingCompetitorId = competitor.id
      try {
        if (!this.canManageCompetitors) throw new Error('Please sign in as an authorized administrator.')
        const endpoint = this.isLocalDevelopment ? '/api/local-competitors' : '/api/competitors'
        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ id: competitor.id })
        })
        const body = await response.json().catch(() => {
          throw new Error('The competitor API did not return valid JSON.')
        })
        if (!response.ok) throw new Error(body.error || 'Unable to remove competitor.')
        if (this.expandedCompetitor === competitor.id) this.expandedCompetitor = null
        await this.loadData()
        this.addCompetitorSuccess = body.message || 'Competitor removed from monitoring.'
      } catch (error) {
        this.deleteCompetitorError = error.message || 'Unable to remove competitor.'
      } finally {
        this.removingCompetitorId = null
      }
    },

    async requestCompetitor() {
      if (this.savingCompetitor) return
      this.addCompetitorError = ''
      this.addCompetitorSuccess = ''
      this.savingCompetitor = true
      try {
        if (!this.canManageCompetitors) throw new Error('Please sign in as an authorized administrator.')
        const endpoint = this.isLocalDevelopment ? '/api/local-competitors' : '/api/competitors'
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(this.newCompetitor)
        })
        const body = await response.json().catch(() => {
          throw new Error('The competitor save API did not return JSON. Check that the local Vite server is running.')
        })
        if (!response.ok) throw new Error(body.error || 'Could not save competitor.')
        this.newCompetitor = { name: '', website: '', sitemap: '' }
        this.showAddCompetitor = false
        this.addCompetitorSuccess = body.message || 'Competitor saved successfully.'
        await this.loadData()
      } catch (error) {
        this.addCompetitorError = error.message || 'Could not save competitor.'
        this.showAddCompetitor = true
      } finally {
        this.savingCompetitor = false
      }
    },
    async loadData() {
      this.loading = true
      this.error = ''

      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}data/competitor-monitor.json?t=${Date.now()}`
        )

        if (!response.ok) {
          throw new Error('Could not load competitor monitoring data.')
        }

        const result = await response.json()

        this.data = {
          lastChecked: result.lastChecked || null,
          scanId: result.scanId || null,
          competitors: result.competitors || {},
          history: Array.isArray(result.history) ? result.history : []
        }
        try {
          const configuredResponse = await fetch(
            `${import.meta.env.BASE_URL}data/extra-competitors.json?t=${Date.now()}`,
            { cache: 'no-store' }
          )
          if (configuredResponse.ok) {
            const configured = await configuredResponse.json()
            this.configuredCompetitors = Array.isArray(configured) ? configured : []
          }
        } catch {
          // A missing optional configuration file must not break the dashboard.
        }
        try {
          const disabledResponse = await fetch(
            `${import.meta.env.BASE_URL}data/disabled-competitors.json?t=${Date.now()}`,
            { cache: 'no-store' }
          )
          if (disabledResponse.ok) {
            const ids = await disabledResponse.json()
            this.disabledCompetitorIds = Array.isArray(ids) ? ids : []
          }
        } catch {
          // An unavailable optional disabled list should not break read-only data.
        }
        // The live admin API reads GitHub directly, so a saved change becomes
        // visible immediately, even before the next static site deployment.
        if (!this.isLocalDevelopment) {
          try {
            const liveResponse = await fetch('/api/competitors', {
              credentials: 'same-origin',
              cache: 'no-store'
            })
            if (liveResponse.ok) {
              const live = await liveResponse.json()
              this.configuredCompetitors = Array.isArray(live.competitors) ? live.competitors : []
              this.disabledCompetitorIds = Array.isArray(live.disabledIds) ? live.disabledIds : []
            }
          } catch {
            // Static data remains readable when the admin API is unavailable.
          }
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
      return this.activeTabs[competitorId] || 'all'
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
          Boolean(this.data.scanId) &&
          item.scanId === this.data.scanId &&
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
        return 'No new SEO pages were discovered in the latest scan. Run the updated scanner to refresh this view.'
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

    getCompetitorNew(competitorId) {
      const record = this.data.competitors[competitorId]
      if (!record) return 0
      if (this.data.scanId && record.scanId !== this.data.scanId) return 0
      // The scanner resets this field each run; do not count historical events.
      const count = Number(record.newSeoPages || 0)
      return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0
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
.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
.add-competitor-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 18px;
  border: 1px solid #2563eb;
  border-radius: 9px;
  background: #2563eb;
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.add-competitor-button:hover { background: #1d4ed8; border-color: #1d4ed8; }
.add-competitor-panel {
  margin-bottom: 28px;
  padding: 22px;
  border: 1px solid #dce4f0;
  border-radius: 14px;
  background: #fff;
}
.add-competitor-panel strong { color: #172033; font-size: 16px; }
.add-competitor-panel p, .add-competitor-panel small { color: #64748b; font-size: 12px; line-height: 1.5; }
.add-competitor-form { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin: 16px 0 10px; }
.add-competitor-form label { display: flex; flex: 1 1 190px; min-width: 0; flex-direction: column; gap: 7px; color: #64748b; font-size: 12px; font-weight: 650; }
.add-competitor-form input { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid #dce4f0; border-radius: 9px; background: #fff; color: #172033; }
.add-competitor-panel .add-competitor-error { color: #c2410c; }
.add-competitor-error-global { padding: 12px 16px; border: 1px solid #fecaca; border-radius: 9px; background: #fff1f2; color: #b91c1c; font-size: 13px; }
.competitor-delete-button {
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid #f3c6c6;
  border-radius: 8px;
  background: #fff;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.competitor-delete-button:hover { background: #fff1f2; border-color: #ef4444; }
.competitor-delete-button:disabled { opacity: 0.65; cursor: not-allowed; }

.add-competitor-success { padding: 12px 16px; border-radius: 9px; background: #ecfdf5; border: 1px solid #bbf7d0; color: #166534; font-size: 13px; }
.add-competitor-button:disabled { opacity: .65; cursor: not-allowed; }
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
