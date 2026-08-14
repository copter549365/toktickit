import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-vh-100 d-flex flex-column">
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark shadow-sm">
        <div className="container">
          <a className="navbar-brand fw-bold fs-4" href="#">
            🎵 TokTicKit
          </a>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#navbarNav"
            aria-controls="navbarNav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto">
              <li className="nav-item">
                <a className="nav-link active" href="#">Home</a>
              </li>
              <li className="nav-item">
                <a className="nav-link" href="#">About</a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-grow-1">
        <section className="bg-dark text-white py-5">
          <div className="container text-center py-4">
            <h1 className="display-4 fw-bold mb-3">Welcome to TokTicKit</h1>
            <p className="lead text-secondary mb-4">
              Your full-stack app is up and running — React + Vite + Express + Prisma
            </p>
            <div className="d-flex gap-3 justify-content-center flex-wrap">
              <button
                id="counter-btn"
                type="button"
                className="btn btn-primary btn-lg px-4"
                onClick={() => setCount((c) => c + 1)}
              >
                Count: {count}
              </button>
              <button
                type="button"
                className="btn btn-outline-light btn-lg px-4"
                onClick={() => setCount(0)}
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        {/* Feature Cards */}
        <section className="py-5">
          <div className="container">
            <h2 className="text-center mb-4 fw-semibold">Stack Overview</h2>
            <div className="row g-4">
              {[
                { icon: '⚛️', title: 'React + Vite', desc: 'Fast frontend with HMR and TypeScript support.' },
                { icon: '🚀', title: 'Express Server', desc: 'RESTful API backend ready to extend.' },
                { icon: '🗄️', title: 'Prisma ORM v7', desc: 'Type-safe database access with PostgreSQL.' },
                { icon: '🐳', title: 'Docker Compose', desc: 'One-command local database setup.' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="col-sm-6 col-lg-3">
                  <div className="card h-100 shadow-sm border-0">
                    <div className="card-body text-center p-4">
                      <div className="fs-1 mb-3">{icon}</div>
                      <h5 className="card-title fw-semibold">{title}</h5>
                      <p className="card-text text-muted small">{desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Alert banner */}
        <section className="container mb-5">
          <div className="alert alert-info d-flex align-items-center gap-2" role="alert">
            <span>ℹ️</span>
            <span>
              Edit <code>client/src/App.tsx</code> to start building your app.
              Database models go in <code>prisma/schema.prisma</code>.
            </span>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-dark text-secondary text-center py-3 small">
        TokTicKit &copy; {new Date().getFullYear()} — Built with React, Express &amp; Prisma
      </footer>
    </div>
  )
}

export default App
