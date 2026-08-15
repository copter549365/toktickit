import { useState } from 'react';
import './App.css';

type SystemStatus = 'idle' | 'loading' | 'online' | 'offline';

interface Category {
  id: number;
  name: string;
}

function App() {
  const [status, setStatus] = useState<SystemStatus>('idle');
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const checkSystem = async () => {
    setStatus('loading');
    setErrorMessage(null);
    setCategories([]);

    try {
      const [healthResponse, categoriesResponse] = await Promise.all([
        fetch(`${API_URL}/api/health`),
        fetch(`${API_URL}/api/categories`),
      ]);

      if (!healthResponse.ok || !categoriesResponse.ok) {
        throw new Error('API request failed');
      }

      const healthData = await healthResponse.json();
      const categoriesData = await categoriesResponse.json();

      if (healthData.status === 'ok' && Array.isArray(categoriesData)) {
        setStatus('online');
        setCategories(categoriesData);
      } else {
        setStatus('offline');
        setErrorMessage('Unable to connect to TokTickIT API');
      }
    } catch {
      setStatus('offline');
      setErrorMessage('Unable to connect to TokTickIT API');
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      {/* Top Navbar */}
      <nav className="navbar navbar-dark bg-dark shadow-sm">
        <div className="container">
          <span className="navbar-brand mb-0 h1 fw-bold">
            TokTickIT
          </span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container py-5 flex-grow-1">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6">
            <div className="card shadow-sm border-0">
              <div className="card-body p-4 text-center">
                <h1 className="h3 fw-bold mb-4 text-dark">
                  TokTickIT IT Service Desk
                </h1>

                <div className="d-grid gap-2 mb-4">
                  <button
                    id="check-system-btn"
                    type="button"
                    className="btn btn-primary btn-lg shadow-sm"
                    onClick={checkSystem}
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        />
                        Checking system...
                      </>
                    ) : (
                      'Check System'
                    )}
                  </button>
                </div>

                {/* Status Result Area */}
                {status === 'loading' && (
                  <div className="alert alert-info d-flex align-items-center justify-content-center gap-2 mb-0" role="status">
                    <span>⏳</span>
                    <span>Loading...</span>
                  </div>
                )}

                {status === 'online' && (
                  <div className="card bg-light border-0 p-3 text-start">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <span className="fw-semibold">System Status:</span>
                      <span className="badge bg-success fs-6">Online</span>
                    </div>

                    <div className="mt-3 pt-3 border-top">
                      <h6 className="fw-bold text-dark mb-2">Supported Request Categories:</h6>
                      {categories.length > 0 ? (
                        <ol className="mb-0 ps-3">
                          {categories.map((category) => (
                            <li key={category.id} className="py-1">
                              {category.name}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-muted mb-0 small">No categories found.</p>
                      )}
                    </div>
                  </div>
                )}

                {status === 'offline' && (
                  <div className="card bg-light border-0 p-3 text-start">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span className="fw-semibold">System Status:</span>
                      <span className="badge bg-danger fs-6">Offline</span>
                    </div>
                    {errorMessage && (
                      <div className="text-danger small mt-1">
                        {errorMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-top py-3 text-center text-muted small">
        TokTickIT &copy; {new Date().getFullYear()} — IT Service Desk
      </footer>
    </div>
  );
}

export default App;
