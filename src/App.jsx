import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

const today = () => new Date().toISOString().slice(0, 10)

const defaultManagers = [
  { id: 'eliya', name: 'אליה' },
  { id: 'liav', name: 'ליאב' },
]

const emptyPlace = {
  name: '',
  address: '',
  wazeLocation: '',
  contact: '',
  phone: '',
  tables: '',
  rentFee: '',
  notes: '',
}

const emptyEntry = {
  date: today(),
  placeId: '',
  profit: '',
  hours: '',
  score: '5',
  notes: '',
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function money(value) {
  return `₪${Number(value || 0).toLocaleString()}`
}

function niceDate(date) {
  if (!date) return ''
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

function dbPlaceToApp(place) {
  return {
    id: place.id,
    name: place.name || '',
    address: place.address || '',
    wazeLocation: place.waze_location || '',
    contact: place.contact || '',
    phone: place.phone || '',
    tables: Number(place.tables || 0),
    rentFee: Number(place.rent_fee || 0),
    notes: place.notes || '',
  }
}

function appPlaceToDb(place) {
  return {
    id: place.id,
    name: place.name,
    address: place.address || '',
    waze_location: place.wazeLocation || '',
    contact: place.contact || '',
    phone: place.phone || '',
    tables: Number(place.tables || 0),
    rent_fee: Number(place.rentFee || 0),
    notes: place.notes || '',
  }
}

function dbEntryToApp(entry) {
  return {
    id: entry.id,
    managerId: entry.manager_id,
    date: entry.date,
    placeId: entry.place_id || '',
    profit: Number(entry.profit || 0),
    hours: Number(entry.hours || 0),
    score: Number(entry.score || 5),
    notes: entry.notes || '',
  }
}

function appEntryToDb(entry) {
  return {
    id: entry.id,
    manager_id: entry.managerId,
    date: entry.date,
    place_id: entry.placeId || null,
    profit: Number(entry.profit || 0),
    hours: Number(entry.hours || 0),
    score: Number(entry.score || 5),
    notes: entry.notes || '',
  }
}

function App() {
  const [managers] = useState(() =>
    load('md_managers', defaultManagers)
  )

  const [places, setPlaces] = useState(() =>
    load('md_places', [])
  )

  const [entries, setEntries] = useState(() =>
    load('md_entries', [])
  )

  const [managerId, setManagerId] = useState(
    () => localStorage.getItem('md_manager') || ''
  )

  const [tab, setTab] = useState('home')

  const [entryForm, setEntryForm] = useState(emptyEntry)
  const [editingEntryId, setEditingEntryId] = useState(null)

  const [placeForm, setPlaceForm] = useState(emptyPlace)

  const [calendarMonth, setCalendarMonth] = useState(
    today().slice(0, 7)
  )

  const [selectedDate, setSelectedDate] = useState(today())
  const [cloudStatus, setCloudStatus] = useState('מתחבר...')

  const manager = managers.find((m) => m.id === managerId)

  useEffect(() => {
    let mounted = true

    async function syncCloud() {
      try {
        const [
          { data: cloudPlaces, error: placesError },
          { data: cloudEntries, error: entriesError },
        ] = await Promise.all([
          supabase.from('places').select('*').order('created_at', {
            ascending: false,
          }),
          supabase.from('entries').select('*').order('date', {
            ascending: false,
          }),
        ])

        if (placesError) throw placesError
        if (entriesError) throw entriesError

        let finalPlaces = cloudPlaces || []
        let finalEntries = cloudEntries || []

        const localPlaces = load('md_places', [])
        const localEntries = load('md_entries', [])

        if (finalPlaces.length === 0 && localPlaces.length > 0) {
          const { error } = await supabase
            .from('places')
            .upsert(localPlaces.map(appPlaceToDb))

          if (error) throw error

          finalPlaces = localPlaces.map(appPlaceToDb)
        }

        if (finalEntries.length === 0 && localEntries.length > 0) {
          const { error } = await supabase
            .from('entries')
            .upsert(localEntries.map(appEntryToDb))

          if (error) throw error

          finalEntries = localEntries.map(appEntryToDb)
        }

        const newPlaces = finalPlaces.map(dbPlaceToApp)
        const newEntries = finalEntries.map(dbEntryToApp)

        if (mounted) {
          setPlaces(newPlaces)
          setEntries(newEntries)
          save('md_places', newPlaces)
          save('md_entries', newEntries)
          setCloudStatus('מחובר')
        }
      } catch (error) {
        console.error('Supabase sync error:', error)

        if (mounted) {
          setCloudStatus('שגיאת חיבור')
        }
      }
    }

    syncCloud()

    const timer = setInterval(syncCloud, 5000)

    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  const currentMonthEntries = useMemo(() => {
    return entries.filter((entry) =>
      entry.date.startsWith(calendarMonth)
    )
  }, [entries, calendarMonth])

  const myMonthEntries = currentMonthEntries.filter(
    (entry) => entry.managerId === managerId
  )

  const myMonthProfit = myMonthEntries.reduce(
    (sum, entry) => sum + Number(entry.profit || 0),
    0
  )

  const businessMonthProfit = currentMonthEntries.reduce(
    (sum, entry) => sum + Number(entry.profit || 0),
    0
  )

  const totalHours = entries.reduce(
    (sum, entry) => sum + Number(entry.hours || 0),
    0
  )

  const selectedEntries = entries.filter(
    (entry) => entry.date === selectedDate
  )

  const selectedTotal = selectedEntries.reduce(
    (sum, entry) => sum + Number(entry.profit || 0),
    0
  )

  const placeStats = useMemo(() => {
    return places
      .map((place) => {
        const related = entries.filter(
          (entry) => entry.placeId === place.id
        )

        const totalProfit = related.reduce(
          (sum, entry) => sum + Number(entry.profit || 0),
          0
        )

        const totalPlaceHours = related.reduce(
          (sum, entry) => sum + Number(entry.hours || 0),
          0
        )

        return {
          ...place,
          visits: related.length,
          totalProfit,
          totalPlaceHours,
          averageProfit: related.length
            ? totalProfit / related.length
            : 0,
        }
      })
      .sort((a, b) => b.totalProfit - a.totalProfit)
  }, [places, entries])

  function chooseManager(id) {
    setManagerId(id)
    localStorage.setItem('md_manager', id)
  }

  function logout() {
    localStorage.removeItem('md_manager')
    setManagerId('')
  }

  function openWaze(place) {
    const location =
      place.wazeLocation?.trim() ||
      place.address?.trim()

    if (!location) {
      alert('לא הוזן מיקום למקום הזה')
      return
    }

    if (
      location.startsWith('http://') ||
      location.startsWith('https://')
    ) {
      window.open(location, '_blank')
      return
    }

    window.open(
      `https://waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`,
      '_blank'
    )
  }

  async function addPlace(e) {
    e.preventDefault()

    if (!placeForm.name.trim()) {
      alert('יש להזין שם מקום')
      return
    }

    const newPlace = {
      id: String(Date.now()),
      ...placeForm,
      tables: Number(placeForm.tables || 0),
      rentFee: Number(placeForm.rentFee || 0),
    }

    const { error } = await supabase
      .from('places')
      .insert(appPlaceToDb(newPlace))

    if (error) {
      console.error(error)
      alert('לא הצלחנו לשמור את המקום')
      return
    }

    const updated = [newPlace, ...places]

    setPlaces(updated)
    save('md_places', updated)
    setPlaceForm(emptyPlace)
  }

  async function saveEntry(e) {
    e.preventDefault()

    if (!entryForm.placeId) {
      alert('יש לבחור מקום עבודה')
      return
    }

    if (editingEntryId) {
      const existing = entries.find(
        (entry) => entry.id === editingEntryId
      )

      const updatedEntry = {
        ...existing,
        ...entryForm,
        id: editingEntryId,
        managerId: existing.managerId,
        profit: Number(entryForm.profit || 0),
        hours: Number(entryForm.hours || 0),
        score: Number(entryForm.score || 5),
      }

      const { error } = await supabase
        .from('entries')
        .update(appEntryToDb(updatedEntry))
        .eq('id', editingEntryId)

      if (error) {
        console.error(error)
        alert('לא הצלחנו לשמור את השינויים')
        return
      }

      const updated = entries.map((entry) =>
        entry.id === editingEntryId
          ? updatedEntry
          : entry
      )

      setEntries(updated)
      save('md_entries', updated)
      setEditingEntryId(null)
    } else {
      const newEntry = {
        id: String(Date.now()),
        managerId,
        ...entryForm,
        profit: Number(entryForm.profit || 0),
        hours: Number(entryForm.hours || 0),
        score: Number(entryForm.score || 5),
      }

      const { error } = await supabase
        .from('entries')
        .insert(appEntryToDb(newEntry))

      if (error) {
        console.error(error)
        alert('לא הצלחנו לשמור את יום העבודה')
        return
      }

      const updated = [newEntry, ...entries]

      setEntries(updated)
      save('md_entries', updated)
    }

    setSelectedDate(entryForm.date)
    setCalendarMonth(entryForm.date.slice(0, 7))
    setEntryForm(emptyEntry)
    setTab('calendar')
  }

  function editEntry(entry) {
    setEntryForm({
      date: entry.date || today(),
      placeId: entry.placeId || '',
      profit: String(entry.profit ?? ''),
      hours: String(entry.hours ?? ''),
      score: String(entry.score ?? 5),
      notes: entry.notes || '',
    })

    setEditingEntryId(entry.id)
    setSelectedDate(entry.date)

    if (entry.date) {
      setCalendarMonth(entry.date.slice(0, 7))
    }

    setTab('add')
  }

  async function deleteEntry(id) {
    if (!confirm('למחוק את יום העבודה?')) return

    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id)

    if (error) {
      console.error(error)
      alert('לא הצלחנו למחוק את יום העבודה')
      return
    }

    const updated = entries.filter(
      (entry) => entry.id !== id
    )

    setEntries(updated)
    save('md_entries', updated)
  }

  if (!manager) {
    return (
      <div className="login-page" dir="rtl">
        <div className="login-card">
          <div className="logo">M</div>

          <h1>יומן מנהלים</h1>
          <p>מי מנהל עכשיו?</p>

          <div className="manager-buttons">
            {managers.map((item) => (
              <button
                key={item.id}
                className="manager-button"
                onClick={() => chooseManager(item.id)}
              >
                <span className="avatar">
                  {item.name[0]}
                </span>

                <span>
                  <strong>{item.name}</strong>
                  <small>כניסה ליומן</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app" dir="rtl">

      <header className="topbar">
        <div>
          <small>
            יומן מנהלים · {cloudStatus}
          </small>
          <h2>{manager.name}</h2>
        </div>

        <button className="logout" onClick={logout}>
          החלף מנהל
        </button>
      </header>

      <main>

        {tab === 'home' && (
          <section>
            <div className="page-heading">
              <h1>שלום {manager.name} 👋</h1>
              <p>מצב העסק כרגע</p>
            </div>

            <div className="hero">
              <p>הרווח שלך החודש</p>
              <h1>{money(myMonthProfit)}</h1>
              <span>{myMonthEntries.length} ימי עבודה</span>
            </div>

            <div className="stats">
              <div className="stat-card">
                <span>💰</span>
                <small>רווח העסק</small>
                <strong>{money(businessMonthProfit)}</strong>
              </div>

              <div className="stat-card">
                <span>📍</span>
                <small>מקומות</small>
                <strong>{places.length}</strong>
              </div>

              <div className="stat-card">
                <span>🕐</span>
                <small>שעות עבודה</small>
                <strong>{totalHours}</strong>
              </div>

              <div className="stat-card">
                <span>🏆</span>
                <small>המקום החזק</small>
                <strong>{placeStats[0]?.name || '—'}</strong>
              </div>
            </div>
          </section>
        )}

        {tab === 'summary' && (
          <section>
            <div className="page-heading">
              <h1>סיכום העסק</h1>
              <p>ביצועים לפי מקומות עבודה</p>
            </div>

            <div className="entries">
              {placeStats.map((place) => (
                <div className="day-job-card" key={place.id}>
                  <div className="job-info">
                    <strong>{place.name}</strong>
                    <span>📅 {place.visits} ימי עבודה</span>
                    <span>🕐 {place.totalPlaceHours} שעות</span>
                    <span>
                      ממוצע לביקור: {money(place.averageProfit)}
                    </span>
                  </div>

                  <div className="job-profit">
                    <strong>{money(place.totalProfit)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'calendar' && (
          <CalendarPage
            month={calendarMonth}
            setMonth={setCalendarMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            entries={entries}
            places={places}
            managers={managers}
            selectedEntries={selectedEntries}
            selectedTotal={selectedTotal}
            editEntry={editEntry}
            deleteEntry={deleteEntry}
            openWaze={openWaze}
          />
        )}

        {tab === 'add' && (
          <section>
            <div className="page-heading">
              <h1>
                {editingEntryId
                  ? 'עריכת יום עבודה'
                  : 'הוספת יום עבודה'}
              </h1>

              <p>
                {editingEntryId
                  ? 'שנה את הפרטים ושמור'
                  : 'הזן את פרטי היום'}
              </p>
            </div>

            <form className="work-form" onSubmit={saveEntry}>

              <label>
                תאריך
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={(e) =>
                    setEntryForm({
                      ...entryForm,
                      date: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                מקום עבודה
                <select
                  value={entryForm.placeId}
                  onChange={(e) =>
                    setEntryForm({
                      ...entryForm,
                      placeId: e.target.value,
                    })
                  }
                >
                  <option value="">בחר מקום</option>

                  {places.map((place) => (
                    <option
                      key={place.id}
                      value={place.id}
                    >
                      {place.name}
                    </option>
                  ))}
                </select>
              </label>

              {places.length === 0 && (
                <button
                  type="button"
                  className="add-place-shortcut"
                  onClick={() => setTab('places')}
                >
                  + הוסף מקום ראשון
                </button>
              )}

              <div className="form-row">
                <label>
                  רווח ₪
                  <input
                    type="number"
                    value={entryForm.profit}
                    onChange={(e) =>
                      setEntryForm({
                        ...entryForm,
                        profit: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  שעות באותו מקום
                  <input
                    type="number"
                    step="0.5"
                    value={entryForm.hours}
                    onChange={(e) =>
                      setEntryForm({
                        ...entryForm,
                        hours: e.target.value,
                      })
                    }
                    placeholder="לדוגמה 6.5"
                  />
                </label>
              </div>

              <label>
                ניקוד
                <select
                  value={entryForm.score}
                  onChange={(e) =>
                    setEntryForm({
                      ...entryForm,
                      score: e.target.value,
                    })
                  }
                >
                  <option value="1">⭐ 1</option>
                  <option value="2">⭐⭐ 2</option>
                  <option value="3">⭐⭐⭐ 3</option>
                  <option value="4">⭐⭐⭐⭐ 4</option>
                  <option value="5">⭐⭐⭐⭐⭐ 5</option>
                </select>
              </label>

              <label>
                הערות
                <textarea
                  value={entryForm.notes}
                  onChange={(e) =>
                    setEntryForm({
                      ...entryForm,
                      notes: e.target.value,
                    })
                  }
                />
              </label>

              <button className="save-button">
                {editingEntryId
                  ? 'שמור שינויים'
                  : 'שמור יום עבודה'}
              </button>

            </form>
          </section>
        )}

        {tab === 'places' && (
          <section>
            <div className="page-heading">
              <h1>מקומות עבודה</h1>
              <p>
                מיקום, Waze, שולחנות ודמי שכירות
              </p>
            </div>

            <form className="work-form" onSubmit={addPlace}>

              <label>
                שם המקום
                <input
                  value={placeForm.name}
                  onChange={(e) =>
                    setPlaceForm({
                      ...placeForm,
                      name: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                כתובת
                <input
                  value={placeForm.address}
                  onChange={(e) =>
                    setPlaceForm({
                      ...placeForm,
                      address: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                מיקום / קישור Waze
                <input
                  value={placeForm.wazeLocation}
                  onChange={(e) =>
                    setPlaceForm({
                      ...placeForm,
                      wazeLocation: e.target.value,
                    })
                  }
                />
              </label>

              <div className="form-row">
                <label>
                  מספר שולחנות
                  <input
                    type="number"
                    value={placeForm.tables}
                    onChange={(e) =>
                      setPlaceForm({
                        ...placeForm,
                        tables: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  דמי שכירות ₪
                  <input
                    type="number"
                    value={placeForm.rentFee}
                    onChange={(e) =>
                      setPlaceForm({
                        ...placeForm,
                        rentFee: e.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <label>
                איש קשר
                <input
                  value={placeForm.contact}
                  onChange={(e) =>
                    setPlaceForm({
                      ...placeForm,
                      contact: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                טלפון
                <input
                  value={placeForm.phone}
                  onChange={(e) =>
                    setPlaceForm({
                      ...placeForm,
                      phone: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                הערות
                <textarea
                  value={placeForm.notes}
                  onChange={(e) =>
                    setPlaceForm({
                      ...placeForm,
                      notes: e.target.value,
                    })
                  }
                />
              </label>

              <button className="save-button">
                הוסף מקום
              </button>
            </form>

            <div className="section-title">
              <h3>המקומות שלי</h3>
            </div>

            <div className="entries">
              {places.map((place) => (
                <div
                  className="day-job-card"
                  key={place.id}
                >
                  <div className="job-info">
                    <strong>{place.name}</strong>
                    <span>
                      📍 {place.address || 'ללא כתובת'}
                    </span>
                    <span>
                      🪑 {place.tables || 0} שולחנות
                    </span>
                    <span>
                      💳 שכירות: {money(place.rentFee)}
                    </span>

                    {place.contact && (
                      <span>👤 {place.contact}</span>
                    )}

                    {place.phone && (
                      <span>📞 {place.phone}</span>
                    )}

                    <button
                      type="button"
                      className="waze-button"
                      onClick={() => openWaze(place)}
                    >
                      🚗 פתח ב-Waze
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      <button
        className="floating-add"
        onClick={() => {
          setEditingEntryId(null)
          setEntryForm({
            ...emptyEntry,
            date: selectedDate || today(),
          })
          setTab('add')
        }}
      >
        +
      </button>

      <nav className="bottom-nav">
        <button
          className={tab === 'home' ? 'active' : ''}
          onClick={() => setTab('home')}
        >
          <span>⌂</span>
          בית
        </button>

        <button
          className={tab === 'calendar' ? 'active' : ''}
          onClick={() => setTab('calendar')}
        >
          <span>▦</span>
          לוח שנה
        </button>

        <div className="nav-space" />

        <button
          className={tab === 'places' ? 'active' : ''}
          onClick={() => setTab('places')}
        >
          <span>★</span>
          מקומות
        </button>

        <button
          className={tab === 'summary' ? 'active' : ''}
          onClick={() => setTab('summary')}
        >
          <span>▤</span>
          סיכום
        </button>
      </nav>

    </div>
  )
}

function CalendarPage({
  month,
  setMonth,
  selectedDate,
  setSelectedDate,
  entries,
  places,
  managers,
  selectedEntries,
  selectedTotal,
  editEntry,
  deleteEntry,
  openWaze,
}) {
  const [year, monthNumber] =
    month.split('-').map(Number)

  const firstDay =
    new Date(year, monthNumber - 1, 1)

  const daysInMonth =
    new Date(year, monthNumber, 0).getDate()

  const firstWeekDay = firstDay.getDay()

  const cells = []

  for (let i = 0; i < firstWeekDay; i++) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(day)
  }

  function changeMonth(amount) {
    const next = new Date(
      year,
      monthNumber - 1 + amount,
      1
    )

    const newMonth =
      `${next.getFullYear()}-${String(
        next.getMonth() + 1
      ).padStart(2, '0')}`

    setMonth(newMonth)
    setSelectedDate(`${newMonth}-01`)
  }

  const title = firstDay.toLocaleDateString(
    'he-IL',
    {
      month: 'long',
      year: 'numeric',
    }
  )

  return (
    <section className="calendar-page">

      <div className="calendar-toolbar">
        <button onClick={() => changeMonth(-1)}>
          ‹
        </button>

        <h1>{title}</h1>

        <button onClick={() => changeMonth(1)}>
          ›
        </button>
      </div>

      <div className="big-calendar">

        <div className="calendar-weekdays">
          {[
            'ראשון',
            'שני',
            'שלישי',
            'רביעי',
            'חמישי',
            'שישי',
            'שבת',
          ].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="calendar-grid-large">

          {cells.map((day, index) => {
            if (!day) {
              return (
                <div
                  key={`empty-${index}`}
                  className="calendar-cell empty-cell"
                />
              )
            }

            const date =
              `${month}-${String(day).padStart(2, '0')}`

            const dayEntries = entries.filter(
              (entry) => entry.date === date
            )

            const dayProfit = dayEntries.reduce(
              (sum, entry) =>
                sum + Number(entry.profit || 0),
              0
            )

            return (
              <button
                key={date}
                className={
                  `calendar-cell ${
                    selectedDate === date
                      ? 'selected-day'
                      : ''
                  } ${
                    dayEntries.length
                      ? 'work-day'
                      : ''
                  }`
                }
                onClick={() => setSelectedDate(date)}
              >
                <strong>{day}</strong>

                {dayEntries.length > 0 && (
                  <>
                    <small>
                      {dayEntries.length} עבודות
                    </small>

                    <em>
                      {money(dayProfit)}
                    </em>
                  </>
                )}
              </button>
            )
          })}

        </div>
      </div>

      <div className="day-details">

        <div className="day-details-title">
          <div>
            <small>היום שנבחר</small>
            <h2>{niceDate(selectedDate)}</h2>
          </div>

          <strong>{money(selectedTotal)}</strong>
        </div>

        {selectedEntries.length === 0 ? (
          <div className="empty">
            <div>📅</div>
            <h3>אין עבודה ביום הזה</h3>
            <p>
              יום שיש בו עבודה מסומן בנקודה כחולה
            </p>
          </div>
        ) : (
          <div className="entries">

            {selectedEntries.map((entry) => {
              const place = places.find(
                (p) => p.id === entry.placeId
              )

              const entryManager = managers.find(
                (m) => m.id === entry.managerId
              )

              return (
                <div
                  className="day-job-card"
                  key={entry.id}
                >
                  <div className="job-info">
                    <strong>
                      {place?.name || 'מקום'}
                    </strong>

                    <span>
                      👤 {entryManager?.name || 'מנהל'}
                    </span>

                    <span>
                      🕐 {entry.hours || 0} שעות
                    </span>

                    <span>
                      ⭐ {entry.score}
                    </span>

                    {place?.address && (
                      <span>
                        📍 {place.address}
                      </span>
                    )}

                    {place && (
                      <button
                        type="button"
                        className="waze-button"
                        onClick={() => openWaze(place)}
                      >
                        🚗 Waze
                      </button>
                    )}
                  </div>

                  <div className="job-profit">
                    <strong>
                      {money(entry.profit)}
                    </strong>

                    <button
                      type="button"
                      onClick={() => editEntry(entry)}
                    >
                      ✏️ עריכה
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => deleteEntry(entry.id)}
                    >
                      מחיקה
                    </button>
                  </div>
                </div>
              )
            })}

          </div>
        )}

      </div>

    </section>
  )
}

export default App