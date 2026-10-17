
import { useMemo, useState, useEffect, useRef } from 'react'
import {
  Search, PlusCircle, MapPin, CalendarDays, ArrowRight,
  PackageSearch, ShieldCheck, Clock3, Heart, Menu, X,
  Smartphone, Eye, EyeOff,
} from 'lucide-react'
import './App.css'

const API_URL = 'http://localhost:8080/api/items'
const AUTH_URL = 'http://localhost:8080/api/auth'
const CLAIMS_URL = 'http://localhost:8080/api/claims'

const initialItems = []

function normalizeItem(item) {
  const record = item ?? {}

  return {
    ...record,
    name: record.title ?? '',
    type: typeof record.status === 'string' ? record.status : '',
    date: record.dateReported ?? '',
    color: 'blue',
    icon: PackageSearch,
  }
}

const categories = [
  'All Items',
  'Electronics',
  'Cards & IDs',
  'Keys',
  'Wallets & Bags',
  'Personal Items',
]

function App() {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Items')
  const [type, setType] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [notice, setNotice] = useState('')
  const [workspaceView, setWorkspaceView] = useState('browse')
  const [myReports, setMyReports] = useState([])
  const [myClaims, setMyClaims] = useState([])
  const [reportClaims, setReportClaims] = useState([])
  const [claimTarget, setClaimTarget] = useState(null)
  const [showClaimForm, setShowClaimForm] = useState(false)
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false)
  const [claimError, setClaimError] = useState('')
  const claimSubmitLock = useRef(false)
  const [claimForm, setClaimForm] = useState({
    foundLocation: '',
    foundDate: new Date().toISOString().slice(0, 10),
    circumstances: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  })

  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [showPassword, setShowPassword] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [authForm, setAuthForm] = useState({
    fullName: '',
    email: '',
    password: '',
  })

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'Electronics',
    type: 'Lost',
    location: '',
    date: new Date().toISOString().slice(0, 10),
  })

  async function fetchItems() {
    try {
      const response = await fetch(API_URL)

      if (!response.ok) {
        throw new Error('Failed to fetch items')
      }

      const data = await response.json()

      setItems(data.map(normalizeItem))
    } catch (error) {
      console.error('Error loading items:', error)
      setNotice('Could not load items. Check whether the backend is running.')
    }
  }

  useEffect(() => {
    fetchItems()
    fetch(`${AUTH_URL}/me`, { credentials: 'include' })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (data) {
          setCurrentUser({
            id: data.id,
            fullName: data.fullName,
            email: data.email,
          })
        }
      })
      .catch(error => console.error('Error restoring session:', error))
  }, [])

  async function openMyReports() {
    if (!currentUser) {
      openAuth('login')
      return
    }

    try {
      const [itemsResponse, claimsResponse] = await Promise.all([
        fetch(`${API_URL}/mine`, { credentials: 'include' }),
        fetch(`${CLAIMS_URL}/for-reports`, { credentials: 'include' }),
      ])
      if (!itemsResponse.ok || !claimsResponse.ok) {
        throw new Error('Could not load your reports.')
      }
      const [itemsData, claimsData] = await Promise.all([
        itemsResponse.json(),
        claimsResponse.json(),
      ])
      setMyReports(itemsData.map(normalizeItem))
      setReportClaims(claimsData)
      setWorkspaceView('reports')
      setNotice('')
    } catch (error) {
      setNotice(error.message || 'Could not load your reports.')
    }
  }

  async function openMyClaims() {
    if (!currentUser) {
      openAuth('login')
      return
    }

    try {
      const response = await fetch(`${CLAIMS_URL}/mine`, { credentials: 'include' })
      if (!response.ok) throw new Error('Could not load your claims.')
      setMyClaims(await response.json())
      setWorkspaceView('claims')
      setNotice('')
    } catch (error) {
      setNotice(error.message || 'Could not load your claims.')
    }
  }

  async function submitClaim(event) {
    event.preventDefault()
    if (!claimTarget || claimSubmitLock.current) return

    claimSubmitLock.current = true
    setIsSubmittingClaim(true)
    setClaimError('')
    try {
      const response = await fetch(`${CLAIMS_URL}/items/${claimTarget.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(claimForm),
      })
      const responseBody = await response.text()
      let data = {}
      if (responseBody) {
        try {
          data = JSON.parse(responseBody)
        } catch {
          data = { detail: responseBody }
        }
      }
      if (!response.ok) {
        const error = new Error(
          response.status === 403
            ? 'You cannot submit a claim for an item you reported.'
            : response.status === 401
              ? 'Your login session has expired. Please log in again.'
              : data?.detail || data?.message || data?.title || data?.error ||
                `Claim submission failed (${response.status}).`
        )
        error.status = response.status
        throw error
      }
      setShowClaimForm(false)
      setClaimTarget(null)
      await openMyClaims()
      setNotice('Your claim has been submitted.')
    } catch (error) {
      setClaimError(error.message || 'Could not submit your claim.')
    } finally {
      claimSubmitLock.current = false
      setIsSubmittingClaim(false)
    }
  }

  async function updateClaimDecision(claimId, status) {
    try {
      const response = await fetch(`${CLAIMS_URL}/${claimId}/decision`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Could not update this claim.')
      }
      await openMyReports()
    } catch (error) {
      setNotice(error.message || 'Could not update this claim.')
    }
  }

  async function confirmClaimReturn(claimId) {
    try {
      const response = await fetch(`${CLAIMS_URL}/${claimId}/confirm-return`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Could not confirm the handover.')
      }
      await fetchItems()
      if (workspaceView === 'reports') await openMyReports()
      else await openMyClaims()
    } catch (error) {
      setNotice(error.message || 'Could not confirm the handover.')
    }
  }

  async function submitAuth(event) {
    event.preventDefault()

    const endpoint = authMode === 'login' ? 'login' : 'register'

    try {
      const response = await fetch(`${AUTH_URL}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          authMode === 'login'
            ? {
                email: authForm.email,
                password: authForm.password,
              }
            : authForm
        ),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.message || data.detail || 'Authentication failed')
        setCurrentUser({
          id: data.id,
          fullName: data.fullName,
          email: data.email,
      })
      setShowAuth(false)
      setNotice(
        `${data.message || 'Success'}${
          data.fullName ? `! Welcome, ${data.fullName}` : ''
        }.`
      )

      setAuthForm({
        fullName: '',
        email: '',
        password: '',
      })
    } catch (error) {
      setNotice(error.message || 'Could not connect to the authentication server.')
    }
  }

  const filteredItems = useMemo(
    () =>
      items.filter(item => {
        const text =
          `${item.name || ''} ${item.description || ''} ${item.location || ''}`.toLowerCase()

        return (
          text.includes(search.toLowerCase()) &&
          (category === 'All Items' || item.category === category) &&
          (type === 'All' || item.type === type)
        )
      }),
    [items, search, category, type]
  )

  function openForm(reportType) {
    if (!currentUser) {
      openAuth('login')
      return
    }

    setForm(current => ({ ...current, type: reportType }))
    setShowForm(true)
    setSelectedItem(null)
    setWorkspaceView('browse')
    setShowAuth(false)
    setNotice('')
  }

  function openAuth(mode = 'login') {
    setAuthMode(mode)
    setShowAuth(true)
    setShowForm(false)
    setSelectedItem(null)
    setNotice('')
    setMenuOpen(false)
  }

  async function logout() {
    try {
      const response = await fetch(`${AUTH_URL}/logout`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) throw new Error('Could not log out.')
      setCurrentUser(null)
      setWorkspaceView('browse')
      setMyReports([])
      setMyClaims([])
      setReportClaims([])
    } catch (error) {
      setNotice(error.message || 'Could not log out.')
    }
  }

  async function submitReport(event) {
    event.preventDefault()

    const newItem = {
      title: form.name,
      description: form.description,
      category: form.category,
      status: form.type === 'Lost' ? 'Lost' : 'Found',
      location: form.location,
      dateReported: form.date,
      contactName: 'LostLink User',
      contactEmail: 'user@example.com',
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Failed to submit report')
      }

      await response.json()
      await fetchItems()

      setShowForm(false)
      setSearch('')
      setCategory('All Items')
      setType('All')
      setNotice('Your report has been submitted successfully!')

      setForm({
        name: '',
        description: '',
        category: 'Electronics',
        type: 'Lost',
        location: '',
        date: new Date().toISOString().slice(0, 10),
      })

      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error('Error submitting report:', error)
      setNotice('Could not submit report: ' + error.message)
    }
  }

  function resetFilters() {
    setSearch('')
    setCategory('All Items')
    setType('All')
  }

  return (
    <div className="app-shell">
      <header className="navbar">
        <a href="#home" className="brand" aria-label="LostLink home">
          <span className="brand-mark">
            <PackageSearch size={25} />
          </span>
          <span className="brand-name">
            Lost<span>Link</span>
            <small>FINDIT ON CAMPUS</small>
          </span>
        </a>

        <button
          className="mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          {menuOpen ? <X /> : <Menu />}
        </button>

        <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
          <a
            className="nav-active"
            href="#home"
            onClick={() => setMenuOpen(false)}
          >
            Home
          </a>
          <a href="#items" onClick={() => setMenuOpen(false)}>
            Browse Items
          </a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
            How It Works
          </a>

          
{currentUser ? (
  <div className="user-profile">
    <span>Welcome, {currentUser.fullName}</span>
    <button
      className="nav-login"
      onClick={logout}
    >
      Log out
    </button>
  </div>
) : (
  <button
    className="nav-login"
    onClick={() => openAuth('login')}
  >
    Log in
  </button>
)}


          <button
            className="btn btn-primary nav-report"
            onClick={() => openForm('Lost')}
          >
            <PlusCircle size={17} /> Report an Item
          </button>
        </nav>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="live-dot" /> YOUR CAMPUS, CONNECTED
            </div>

            <h1>
              Lost something?
              <br />
              <span>Let's find it.</span>
            </h1>

            <p className="hero-copy">
              A little help goes a long way. Report lost belongings, share
              what you've found, and help reunite your campus community with
              the things that matter.
            </p>

            <div className="hero-actions">
              <button
                className="btn btn-primary btn-large"
                onClick={() => openForm('Lost')}
              >
                <Search size={18} /> I lost something
              </button>
              <button
                className="btn btn-outline btn-large"
                onClick={() => openForm('Found')}
              >
                <PlusCircle size={18} /> I found something
              </button>
            </div>

            <div className="trust-line">
              <ShieldCheck size={17} />
              <span>Built for students. Powered by community.</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="hero-glow" />

            <div className="hero-card card-back">
              <span className="mini-icon">
                <Smartphone />
              </span>
              <span className="fake-line long" />
              <span className="fake-line short" />
            </div>

            <div className="hero-card card-front">
              <div className="hero-card-top">
                <span className="status-pill">
                  <span /> MATCH FOUND
                </span>
                <span className="card-dots">•••</span>
              </div>

              <div className="hero-object">
                <PackageSearch size={61} strokeWidth={1.35} />
              </div>

              <h3>Something found its way home.</h3>
              <p>A lost item, a kind student, a happy reunion.</p>

              <div className="match-bar">
                <span />
                <span />
                <span />
              </div>

              <div className="hero-card-bottom">
                <span className="avatar-stack">
                  <i>R</i>
                  <i>A</i>
                  <i>S</i>
                </span>
                <span>Campus community</span>
                <Heart size={17} />
              </div>
            </div>

            <div className="float-chip chip-top">
              <span className="chip-icon green">
                <ShieldCheck size={16} />
              </span>
              <span>
                <b>Safe &amp; secure</b>
                <small>Community verified</small>
              </span>
            </div>

            <div className="float-chip chip-bottom">
              <span className="chip-icon purple">
                <Search size={17} />
              </span>
              <span>
                <b>Smart matching</b>
                <small>Find things faster</small>
              </span>
            </div>
          </div>

          <div className="hero-bottom">
            <div>
              <strong>One campus.</strong>
              <span> One community.</span>
            </div>
            <span>Every item has a way back.</span>
          </div>
        </section>

        <section className="stats-strip" aria-label="Platform overview">
          <div className="stat">
            <span className="stat-icon purple">
              <PackageSearch />
            </span>
            <div>
              <strong>{items.length}</strong>
              <span>Reported items</span>
            </div>
          </div>

          <div className="stat">
            <span className="stat-icon green">
              <ShieldCheck />
            </span>
            <div>
              <strong>{items.filter(item => item.type === 'Found').length}</strong>
              <span>Found reports</span>
            </div>
          </div>

          <div className="stat">
            <span className="stat-icon orange">
              <Clock3 />
            </span>
            <div>
              <strong>{items.filter(item => item.type === 'Lost').length}</strong>
              <span>Lost reports</span>
            </div>
          </div>

          <div className="stat">
            <span className="stat-icon blue">
              <Heart />
            </span>
            <div>
              <strong>One goal</strong>
              <span>Bring it back</span>
            </div>
          </div>
        </section>

        <section className="items-section" id="items">
          <div className="section-heading">
            <div>
              <span className="section-kicker">THE CAMPUS BOARD</span>
              <h2>
                {workspaceView === 'browse'
                  ? 'Recently reported items'
                  : workspaceView === 'reports'
                    ? 'My Reports'
                    : 'My Claims'}
              </h2>
              <p>
                {workspaceView === 'browse'
                  ? 'Take a look. Your missing item might already be here.'
                  : workspaceView === 'reports'
                    ? 'Items you reported and the claims submitted for them.'
                    : 'Claims you have submitted for reported items.'}
              </p>
            </div>

            <div className="claim-view-actions">
              {currentUser && workspaceView !== 'browse' && (
                <button className="text-link" onClick={() => setWorkspaceView('browse')}>
                  Browse Items
                </button>
              )}
              {currentUser && (
                <>
                  <button className="text-link" onClick={openMyReports}>My Reports</button>
                  <button className="text-link" onClick={openMyClaims}>My Claims</button>
                </>
              )}
              {workspaceView === 'browse' && (
                <button className="text-link" onClick={resetFilters}>
                  View all items <ArrowRight size={17} />
                </button>
              )}
            </div>
          </div>

          {workspaceView === 'browse' && (
            <>
          <div className="search-panel">
            <div className="search-box">
              <Search size={20} />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search by item, description or location..."
                aria-label="Search items"
              />
            </div>

            <div className="type-filters">
              {['All', 'Lost', 'Found'].map(option => (
                <button
                  key={option}
                  className={
                    type === option
                      ? 'type-filter selected'
                      : 'type-filter'
                  }
                  onClick={() => setType(option)}
                >
                  {option === 'All'
                    ? 'All items'
                    : option === 'Lost'
                      ? 'Lost items'
                      : 'Found items'}
                </button>
              ))}
            </div>
          </div>

          <div className="category-list">
            {categories.map(option => (
              <button
                key={option}
                className={
                  category === option
                    ? 'category-chip active'
                    : 'category-chip'
                }
                onClick={() => setCategory(option)}
              >
                {option}
              </button>
            ))}
          </div>
            </>
          )}

          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                onClick={() => setNotice('')}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {workspaceView !== 'claims' ? (
          <div className="item-grid">
            {(workspaceView === 'reports' ? myReports : filteredItems).map((item, index) => {
              const ItemIcon = item.icon || PackageSearch
              const itemType = typeof item.type === 'string' ? item.type : ''

              return (
                <article className="item-card" key={item.id ?? `item-${index}`}>
                  <button
                    className={`item-art ${item.color || 'blue'}`}
                    onClick={() => setSelectedItem(item)}
                    aria-label={`View ${item.name}`}
                  >
                    <span className={`item-type ${itemType.toLowerCase()}`}>
                      {itemType}
                    </span>
                    <ItemIcon size={57} strokeWidth={1.4} />
                    <span className="art-open">
                      View details <ArrowRight size={14} />
                    </span>
                  </button>

                  <div className="item-card-content">
                    <span className="item-category">{item.category}</span>
                    <h3>{item.name}</h3>
                    {workspaceView === 'reports' && item.returned && (
                      <span className="status-pill">Returned</span>
                    )}
                    <p className="item-description">{item.description}</p>

                    <div className="item-meta">
                      <span>
                        <MapPin size={15} />
                        {item.location}
                      </span>
                      <span>
                        <CalendarDays size={15} />
                        {item.date}
                      </span>
                    </div>

                    <button
                      className="item-action"
                      onClick={() => setSelectedItem(item)}
                    >
                      View item details <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          ) : (
            <div className="claim-list">
              {myClaims.map(claim => (
                <article className="claim-card" key={claim.id}>
                  <div className="claim-card-heading">
                    <h3>{claim.itemTitle}</h3>
                    <span className={`claim-status ${claim.status.toLowerCase()}`}>
                      {claim.status}
                    </span>
                  </div>
                  <p><strong>Found:</strong> {claim.foundLocation} on {claim.foundDate}</p>
                  <p>{claim.circumstances}</p>
                  <p><strong>Contact:</strong> {claim.contactName} · {claim.contactEmail}{claim.contactPhone ? ` · ${claim.contactPhone}` : ''}</p>
                  {claim.status === 'ACCEPTED' && !claim.finderConfirmedReturn && (
                    <button className="text-link" onClick={() => confirmClaimReturn(claim.id)}>
                      Confirm handover
                    </button>
                  )}
                  {claim.status === 'ACCEPTED' && claim.finderConfirmedReturn && (
                    <p className="claim-confirmation">You confirmed the handover. Waiting for the reporter.</p>
                  )}
                </article>
              ))}
            </div>
          )}

          {workspaceView === 'reports' && reportClaims.length > 0 && (
            <div className="claim-list">
              <h3>Claims on your reports</h3>
              {reportClaims.map(claim => (
                <article className="claim-card" key={claim.id}>
                  <div className="claim-card-heading">
                    <h3>{claim.itemTitle}</h3>
                    <span className={`claim-status ${claim.status.toLowerCase()}`}>
                      {claim.status}
                    </span>
                  </div>
                  <p><strong>Finder:</strong> {claim.finderName}</p>
                  <p><strong>Found:</strong> {claim.foundLocation} on {claim.foundDate}</p>
                  <p>{claim.circumstances}</p>
                  <p><strong>Contact:</strong> {claim.contactName} · {claim.contactEmail}{claim.contactPhone ? ` · ${claim.contactPhone}` : ''}</p>
                  {claim.status === 'PENDING' && (
                    <div className="claim-actions">
                      <button className="btn btn-primary" onClick={() => updateClaimDecision(claim.id, 'ACCEPTED')}>Accept</button>
                      <button className="btn btn-outline" onClick={() => updateClaimDecision(claim.id, 'REJECTED')}>Reject</button>
                    </div>
                  )}
                  {claim.status === 'ACCEPTED' && !claim.reporterConfirmedReturn && (
                    <button className="text-link" onClick={() => confirmClaimReturn(claim.id)}>
                      Confirm handover
                    </button>
                  )}
                  {claim.status === 'ACCEPTED' && claim.reporterConfirmedReturn && (
                    <p className="claim-confirmation">You confirmed the handover. Waiting for the finder.</p>
                  )}
                </article>
              ))}
            </div>
          )}

          {((workspaceView === 'browse' && filteredItems.length === 0)
            || (workspaceView === 'reports' && myReports.length === 0)
            || (workspaceView === 'claims' && myClaims.length === 0)) && (
            <div className="empty-state">
              <PackageSearch size={36} />
              <h3>{workspaceView === 'claims' ? 'No claims yet' : workspaceView === 'reports' ? 'No reports yet' : 'No items found'}</h3>
              <p>{workspaceView === 'browse' ? 'Try another search or clear your filters.' : 'Your activity will appear here.'}</p>
              {workspaceView === 'browse' && (
                <button className="btn btn-primary" onClick={resetFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-heading centered">
            <div>
              <span className="section-kicker">SIMPLE BY DESIGN</span>
              <h2>Lost. Found. Back to you.</h2>
              <p>Three simple steps to bring belongings home.</p>
            </div>
          </div>

          <div className="steps-grid">
            <article className="step-card">
              <span className="step-number">01</span>
              <span className="step-icon purple">
                <Search size={25} />
              </span>
              <h3>Report or search</h3>
              <p>
                Post a lost or found item, or search the campus board for a
                possible match.
              </p>
            </article>

            <article className="step-card">
              <span className="step-number">02</span>
              <span className="step-icon green">
                <ShieldCheck size={25} />
              </span>
              <h3>Verify ownership</h3>
              <p>
                Submit a claim with identifying details so the rightful owner
                can be verified.
              </p>
            </article>

            <article className="step-card">
              <span className="step-number">03</span>
              <span className="step-icon orange">
                <Heart size={25} />
              </span>
              <h3>Make the reunion</h3>
              <p>
                Coordinate a safe handover and let the item find its way home.
              </p>
            </article>
          </div>
        </section>

        <section className="cta-section">
          <div>
            <span className="section-kicker">BE SOMEONE'S GOOD NEWS</span>
            <h2>Found something? Make someone's day.</h2>
            <p>
              One quick report could be the missing piece of someone's day.
            </p>
          </div>
          <button
            className="btn btn-light btn-large"
            onClick={() => openForm('Found')}
          >
            <PlusCircle size={18} /> Report a found item
          </button>
        </section>
      </main>

      <footer className="footer">
        <a href="#home" className="brand footer-brand">
          <span className="brand-mark">
            <PackageSearch size={23} />
          </span>
          <span className="brand-name">
            Lost<span>Link</span>
            <small>FINDIT ON CAMPUS</small>
          </span>
        </a>
        <p>Made for campus. Built around community.</p>
        <span className="footer-copy">
          © {new Date().getFullYear()} LostLink
        </span>
      </footer>

      {showForm && (
        <div
          className="modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setShowForm(false)
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">CAMPUS BOARD</span>
                <h2 id="report-title">Report an item</h2>
                <p>Give the community enough detail to help.</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowForm(false)}
                aria-label="Close form"
              >
                <X />
              </button>
            </div>

            <form onSubmit={submitReport} className="report-form">
              <label>
                Report type
                <select
                  value={form.type}
                  onChange={event =>
                    setForm({ ...form, type: event.target.value })
                  }
                >
                  <option>Lost</option>
                  <option>Found</option>
                </select>
              </label>

              <label>
                Item name
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={event =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="e.g. Black headphones"
                />
              </label>

              <label>
                Category
                <select
                  value={form.category}
                  onChange={event =>
                    setForm({ ...form, category: event.target.value })
                  }
                >
                  {categories
                    .filter(item => item !== 'All Items')
                    .map(item => (
                      <option key={item}>{item}</option>
                    ))}
                </select>
              </label>

              <label>
                Location
                <input
                  required
                  maxLength={150}
                  value={form.location}
                  onChange={event =>
                    setForm({ ...form, location: event.target.value })
                  }
                  placeholder="Where was it lost or found?"
                />
              </label>

              <label>
                Date
                <input
                  required
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.date}
                  onChange={event =>
                    setForm({ ...form, date: event.target.value })
                  }
                />
              </label>

              <label>
                Description
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={form.description}
                  onChange={event =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Describe the item and useful identifying details."
                />
              </label>

              <button
                type="submit"
                className="btn btn-primary btn-large form-submit"
              >
                <PlusCircle size={18} /> Submit report
              </button>

              <p className="form-note">
                <ShieldCheck size={15} /> Your report will be saved to LostLink.
              </p>
            </form>
          </section>
        </div>
      )}

      {selectedItem && (
        <div
          className="modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setSelectedItem(null)
            }
          }}
        >
          <section
            className="modal details-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">
                  {selectedItem.type.toUpperCase()} REPORT
                </span>
                <h2 id="detail-title">{selectedItem.name}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelectedItem(null)}
                aria-label="Close details"
              >
                <X />
              </button>
            </div>

            <div className={`detail-art item-art ${selectedItem.color || 'blue'}`}>
              {(() => {
                const Icon = selectedItem.icon || PackageSearch
                return <Icon size={70} strokeWidth={1.4} />
              })()}
            </div>

            <span className="item-category">{selectedItem.category}</span>
            <p>{selectedItem.description}</p>

            <div className="detail-meta">
              <span>
                <MapPin size={17} /> {selectedItem.location}
              </span>
              <span>
                <CalendarDays size={17} /> {selectedItem.date}
              </span>
            </div>

            <button
              className="btn btn-primary btn-large form-submit"
              onClick={() => {
                const item = selectedItem
                setSelectedItem(null)
                if (!currentUser) {
                  openAuth('login')
                  setNotice('Log in to continue with an item claim.')
                } else {
                  setClaimTarget(item)
                  setClaimForm({
                    foundLocation: '',
                    foundDate: new Date().toISOString().slice(0, 10),
                    circumstances: '',
                    contactName: currentUser.fullName || '',
                    contactEmail: currentUser.email || '',
                    contactPhone: '',
                  })
                  setShowClaimForm(true)
                }
              }}
            >
              {selectedItem.type === 'Found'
                ? 'Claim this item'
                : 'I may have found this'}
              <ArrowRight size={18} />
            </button>
          </section>
        </div>
      )}

      {showClaimForm && claimTarget && (
        <div
          className="modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setShowClaimForm(false)
              setClaimTarget(null)
            }
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="claim-title"
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">ITEM CLAIM</span>
                <h2 id="claim-title">Report finding this item</h2>
                <p>{claimTarget.name}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setShowClaimForm(false)
                  setClaimTarget(null)
                }}
                aria-label="Close claim form"
              >
                <X />
              </button>
            </div>

            <form onSubmit={submitClaim} className="report-form claim-form">
              <label>
                Where did you find it?
                <input
                  required
                  maxLength={150}
                  value={claimForm.foundLocation}
                  onChange={event => setClaimForm({ ...claimForm, foundLocation: event.target.value })}
                />
              </label>
              <label>
                When did you find it?
                <input
                  required
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={claimForm.foundDate}
                  onChange={event => setClaimForm({ ...claimForm, foundDate: event.target.value })}
                />
              </label>
              <label>
                Circumstances
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={claimForm.circumstances}
                  onChange={event => setClaimForm({ ...claimForm, circumstances: event.target.value })}
                  placeholder="Describe how you found the item."
                />
              </label>
              <label>
                Your name
                <input
                  required
                  maxLength={100}
                  value={claimForm.contactName}
                  onChange={event => setClaimForm({ ...claimForm, contactName: event.target.value })}
                />
              </label>
              <label>
                Contact email
                <input
                  required
                  type="email"
                  maxLength={150}
                  value={claimForm.contactEmail}
                  onChange={event => setClaimForm({ ...claimForm, contactEmail: event.target.value })}
                />
              </label>
              <label>
                Contact phone (optional)
                <input
                  type="tel"
                  maxLength={30}
                  value={claimForm.contactPhone}
                  onChange={event => setClaimForm({ ...claimForm, contactPhone: event.target.value })}
                />
              </label>
              {claimError && (
                <p className="claim-error" role="alert">{claimError}</p>
              )}
              <button
                type="submit"
                className="btn btn-primary btn-large form-submit"
                disabled={isSubmittingClaim}
                aria-busy={isSubmittingClaim}
              >
                {isSubmittingClaim ? 'Submitting...' : 'Submit claim'}
              </button>
            </form>
          </section>
        </div>
      )}

      {showAuth && (
        <div
          className="modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setShowAuth(false)
              window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <div className="modal-heading">
              <div>
                <span className="section-kicker">LOSTLINK ACCOUNT</span>
                <h2 id="auth-title">
                  {authMode === 'login'
                    ? 'Welcome back'
                    : 'Create your account'}
                </h2>
                <p>
                  {authMode === 'login'
                    ? 'Log in to continue to LostLink.'
                    : 'Join your campus community.'}
                </p>
              </div>

              <button
                className="icon-button"
                type="button"
                onClick={() => setShowAuth(false)}
                aria-label="Close authentication form"
              >
                <X />
              </button>
            </div>

            <form onSubmit={submitAuth} className="report-form">
              {authMode === 'register' && (
                <label>
                  Full name
                  <input
                    required
                    maxLength={100}
                    value={authForm.fullName}
                    onChange={event =>
                      setAuthForm({
                        ...authForm,
                        fullName: event.target.value,
                      })
                    }
                    placeholder="Enter your full name"
                  />
                </label>
              )}

              <label>
                Email
                <input
                  required
                  type="email"
                  maxLength={150}
                  value={authForm.email}
                  onChange={event =>
                    setAuthForm({
                      ...authForm,
                      email: event.target.value,
                    })
                  }
                  placeholder="you@example.com"
                />
              </label>

              <label>
                Password
                <div className="password-field">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    value={authForm.password}
                    onChange={event =>
                      setAuthForm({
                        ...authForm,
                        password: event.target.value,
                      })
                    }
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                className="btn btn-primary btn-large form-submit"
              >
                {authMode === 'login' ? 'Log in' : 'Create account'}
              </button>

              <p className="form-note">
                {authMode === 'login'
                  ? "Don't have an account?"
                  : 'Already have an account?'}{' '}

                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setAuthMode(
                      authMode === 'login' ? 'register' : 'login'
                    )
                    setNotice('')
                  }}
                >
                  {authMode === 'login' ? 'Register' : 'Log in'}
                </button>
              </p>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
