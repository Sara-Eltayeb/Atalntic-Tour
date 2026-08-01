import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, Bot, CalendarDays, CloudSun, Compass, ExternalLink, MapPin, Menu, Mountain, RefreshCw, Send, Sparkles, Users, X } from 'lucide-react'
import './styles.css'
import './overrides.css'

const SHEET_ID = '1balBGf8QhZ5dc-RCCAPt2kcrcf6m_YRh0HL_r8bBtJw'
const SHEET_GID = '120683740'
const AI_WORKER_URL = 'https://atlantic-coast-ai.atlantic-coast-tours-ai-sara.workers.dev/'

const suggestions = [
  'What tours are available this week?',
  'Will it rain at the Cliffs of Moher tomorrow?',
  'Find me an outdoor adventure for under €100',
]

const fallbackTours = [
  { name: 'Cliffs of Moher & The Burren', location: 'Cliffs of Moher', price: '€65', duration: '8 hours', availability: 'Available', type: 'Sightseeing' },
  { name: 'Connemara & Kylemore Abbey', location: 'Connemara', price: '€55', duration: '9 hours', availability: 'Available', type: 'Sightseeing' },
  { name: 'Aran Islands Explorer', location: 'Aran Islands', price: '€89', duration: '10 hours', availability: 'Limited spaces', type: 'Day trip' },
  { name: 'Wild Atlantic Sea Kayaking', location: 'Galway Bay', price: '€95', duration: '3 hours', availability: 'Available', type: 'Outdoor activity' },
]

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (const char of text.replace(/^\uFEFF/, '')) {
    if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((char === '\n' || char === '\r') && !quoted) { if (cell || row.length) row.push(cell.trim()); if (row.length) rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row) }
  return rows
}

function normalizeTours(csv) {
  const rows = parseCsv(csv)
  if (rows.length < 2) return fallbackTours
  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const find = (item, names) => { const i = names.map((n) => headers.indexOf(n)).find((n) => n >= 0); return i === undefined ? '' : item[i] || '' }
  const tours = rows.slice(1).map((item) => {
    const rawPrice = find(item, ['price', 'priceeur', 'cost', 'adultprice'])
    return {
    name: find(item, ['tour', 'tourname', 'name', 'title']) || 'West Coast experience',
    location: find(item, ['location', 'destination', 'meetingpoint']) || 'West of Ireland',
    price: rawPrice ? (rawPrice.startsWith('€') ? rawPrice : `€${rawPrice}`) : 'Contact us',
    duration: find(item, ['duration', 'durationhours', 'length']) || 'Full day',
    availability: find(item, ['availability', 'availableslots', 'slotsthisweek', 'slots', 'status']) || 'Check availability',
    type: find(item, ['type', 'category']) || 'Guided tour',
    }
  }).filter((tour) => tour.name)
  return tours.length ? tours : fallbackTours
}

async function getTours() {
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`)
  if (!response.ok) throw new Error('The tour catalogue could not be reached.')
  return normalizeTours(await response.text())
}

const coordinates = {
  'Cliffs of Moher': [53.0097, -9.3915], Connemara: [53.496, -9.879], 'Aran Islands': [53.125, -9.7], 'Ring of Kerry': [51.9, -9.8], 'Galway Bay': [53.25, -9.05], Galway: [53.27, -9.05],
}

async function getWeather(location) {
  const key = Object.keys(coordinates).find((name) => location.toLowerCase().includes(name.toLowerCase())) || 'Galway Bay'
  const [latitude, longitude] = coordinates[key]
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FDublin&forecast_days=3`)
  if (!response.ok) throw new Error('Weather data is temporarily unavailable.')
  const data = await response.json()
  return { location: key, days: data.daily.time.map((date, i) => ({ date, high: Math.round(data.daily.temperature_2m_max[i]), low: Math.round(data.daily.temperature_2m_min[i]), rain: data.daily.precipitation_probability_max[i], code: data.daily.weather_code[i] })) }
}

function weatherLabel(code) { return code <= 3 ? 'Partly cloudy' : code <= 48 ? 'Misty' : code <= 67 ? 'Light rain' : code <= 82 ? 'Showers' : 'Windy' }
function formatDate(date) { return new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)) }

async function askGemini(question, tours, weather, history) {
  const context = `You are Coast, the friendly travel concierge for Atlantic Coast Tours, a boutique Irish operator. Answer using only the live catalogue and weather tool results below. Be concise, warm, and practical. Use euro prices exactly as supplied. If something is unavailable, say so. Never invent availability. Mention that weather is a forecast and conditions can change. If the customer asks for something unrelated, respond kindly: apologize that you cannot order or arrange that service, then offer to help with Atlantic Coast Tours, destinations, prices, availability, or weather. Never sound dismissive.\n\nLIVE TOUR CATALOGUE:\n${JSON.stringify(tours)}\n\nLIVE WEATHER:\n${JSON.stringify(weather)}\n\nConversation:\n${history.map((m) => `${m.role}: ${m.text}`).join('\n')}\n\nCustomer: ${question}`
  const response = await fetch(AI_WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: context }] }], generationConfig: { temperature: 0.55, maxOutputTokens: 500 } }) })
  if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail?.error?.message || 'Gemini could not answer right now.') }
  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'I could not find an answer in the live trip data.'
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [tours, setTours] = useState(fallbackTours)
  const [catalogueState, setCatalogueState] = useState('loading')
  const [weather, setWeather] = useState(null)
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hello! I’m Coast, your west coast travel guide. Ask me about tours, availability, prices, or what the weather has in store.', time: 'Now' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const loadCatalogue = async () => { setCatalogueState('loading'); try { setTours(await getTours()); setCatalogueState('live') } catch { setCatalogueState('fallback') } }
  useEffect(() => { loadCatalogue() }, [])

  const submit = async (event, preset) => {
    event?.preventDefault(); const question = (preset || input).trim(); if (!question || loading) return
    setInput(''); setLoading(true); setMessages((old) => [...old, { role: 'user', text: question, time: 'Now' }])
    try { let currentTours = tours; try { currentTours = await getTours(); setTours(currentTours) } catch {} let nextWeather = null; try { nextWeather = await getWeather(question); setWeather(nextWeather) } catch { setWeather(null) } const answer = await askGemini(question, currentTours, nextWeather, messages); setMessages((old) => [...old, { role: 'assistant', text: answer, time: 'Now' }]) }
    catch (error) { setMessages((old) => [...old, { role: 'assistant', text: error.message, time: 'Now', error: true }]) }
    finally { setLoading(false) }
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Compass size={20} /></span><span>Atlantic Coast <b>TOURS</b></span></a><nav className={menuOpen ? 'open' : ''}><a href="#chat">Ask Coast</a><a href="#experiences">Experiences</a><a href="#about">Our Ireland</a></nav><div className="top-actions"><span className="live-pill"><i /> Live data</span><button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div></header>
    <main id="top">
      <section className="hero"><div className="hero-copy"><p className="eyebrow"><Sparkles size={15} /> Your west coast guide</p><h1>Go where the<br /><em>Atlantic</em> leads.</h1><p className="hero-text">A little local knowledge goes a long way. Ask Coast about the best day trips, live availability, and the weather waiting beyond the next bend.</p><a className="primary-btn" href="#chat">Plan your day <ArrowUpRight size={17} /></a></div><div className="hero-art"><div className="sun" /><div className="cliff cliff-back" /><div className="cliff cliff-front" /><div className="sea-line line-one" /><div className="sea-line line-two" /><div className="hero-stamp"><span>EST.</span><strong>2008</strong><small>GALWAY · IRELAND</small></div></div></section>
      <section className="chat-layout" id="chat"><div className="chat-intro"><p className="eyebrow">The Coast concierge</p><h2>Tell me what<br /><em>you’re after.</em></h2><p>From a misty morning in Connemara to a golden hour on the Cliffs, I’ll match you with what’s happening right now.</p><div className="tool-list"><div><span><CalendarDays size={17} /></span><p><b>Tour catalogue</b><small>Prices & spaces, live from our team</small></p></div><div><span><CloudSun size={17} /></span><p><b>Weather check</b><small>Forecasts for wherever you’re headed</small></p></div></div></div><div className="chat-card"><div className="chat-header"><div className="bot-avatar"><Bot size={20} /></div><div><b>Coast</b><small><i /> Online · Atlantic Coast Tours</small></div><button title="Refresh catalogue" onClick={loadCatalogue}><RefreshCw size={17} className={catalogueState === 'loading' ? 'spin' : ''} /></button></div><div className="messages">{messages.map((message, index) => <div className={`message-row ${message.role}`} key={index}><div className="message-bubble">{message.text.split('\n').map((line, i) => <React.Fragment key={i}>{line}{i < message.text.split('\n').length - 1 && <br />}</React.Fragment>)}<small>{message.time}</small></div></div>)}{loading && <div className="message-row assistant"><div className="message-bubble typing"><i /><i /><i /></div></div>} </div><div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={(e) => submit(e, suggestion)}>{suggestion}</button>)}</div><form className="composer" onSubmit={submit}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your next adventure..." /><button aria-label="Send message" disabled={loading}><Send size={18} /></button></form><p className="chat-note"><LockIcon /> Your Gemini key stays in this browser and is never sent to us.</p></div></section>
      <section className="chat-layout" id="chat"><div className="chat-intro"><p className="eyebrow">The Coast concierge</p><h2>Tell me what<br /><em>you’re after.</em></h2><p>From a misty morning in Connemara to a golden hour on the Cliffs, I’ll match you with what’s happening right now.</p><div className="tool-list"><div><span><CalendarDays size={17} /></span><p><b>Tour catalogue</b><small>Prices & spaces, live from our team</small></p></div><div><span><CloudSun size={17} /></span><p><b>Weather check</b><small>Forecasts for wherever you’re headed</small></p></div></div></div><div className="chat-card"><div className="chat-header"><div className="bot-avatar"><Bot size={20} /></div><div><b>Coast</b><small><i /> Online · Atlantic Coast Tours</small></div><button title="Refresh catalogue" onClick={loadCatalogue}><RefreshCw size={17} className={catalogueState === 'loading' ? 'spin' : ''} /></button></div><div className="messages">{messages.map((message, index) => <div className={`message-row ${message.role}`} key={index}><div className="message-bubble">{message.text.split('\n').map((line, i) => <React.Fragment key={i}>{line}{i < message.text.split('\n').length - 1 && <br />}</React.Fragment>)}<small>{message.time}</small></div></div>)}{loading && <div className="message-row assistant"><div className="message-bubble typing"><i /><i /><i /></div></div>} </div><div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={(e) => submit(e, suggestion)}>{suggestion}</button>)}</div><form className="composer" onSubmit={submit}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your next adventure..." /><button aria-label="Send message" disabled={loading}><Send size={18} /></button></form><p className="chat-note"><LockIcon /> Your Gemini key stays in this browser and is never sent to us.</p></div></section>
      <section className="experience-section" id="experiences"><div className="section-heading"><div><p className="eyebrow">Pick your kind of day</p><h2>Made for the <em>wanderers.</em></h2></div><a href="#chat">See all with Coast <ArrowUpRight size={16} /></a></div><div className="experience-grid"><ExperienceCard icon={<Mountain />} title="Wild landscapes" text="Cliffs, peaks and ancient stone." tone="ochre" /><ExperienceCard icon={<MapPin />} title="Island time" text="Slow days out on the Atlantic." tone="blue" /><ExperienceCard icon={<Users />} title="Good company" text="Small groups, big stories." tone="green" /></div></section>
      <section className="weather-panel">{weather ? <><div><p className="eyebrow">Forecast tool · {weather.location}</p><h3>Pack for the <em>real Ireland.</em></h3></div><div className="forecast-row">{weather.days.map((day) => <div className="forecast" key={day.date}><b>{formatDate(day.date)}</b><CloudSun size={23} /><strong>{day.high}° <small>{day.low}°</small></strong><span>{weatherLabel(day.code)} · {day.rain}% rain</span></div>)}</div></> : <><div><p className="eyebrow">Live weather tool</p><h3>Wondering what to pack?</h3><p>Ask Coast about a destination and we’ll pull the latest local forecast.</p></div><a className="outline-btn" href="#chat">Check a forecast <CloudSun size={16} /></a></>}</section>
    </main><footer id="about"><span className="brand"><span className="brand-mark"><Compass size={16} /></span> Atlantic Coast <b>TOURS</b></span><span>West is best. Galway, Ireland · © 2025</span><a href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`} target="_blank" rel="noreferrer">View live source <ExternalLink size={13} /></a></footer>
  </div>
}

function ExperienceCard({ icon, title, text, tone }) { return <div className={`experience-card ${tone}`}><div className="card-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div><ArrowUpRight className="card-arrow" size={19} /></div> }
function LockIcon() { return <span className="lock-icon">⌁</span> }

createRoot(document.getElementById('root')).render(<App />)
