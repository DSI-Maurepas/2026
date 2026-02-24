// src/components/auth/LoginPage.jsx
import googleSheetsService from "../../services/googleSheetsService";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks";
import { ELECTION_CONFIG, ROUTES } from "../../utils/constants";

export default function LoginPage() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.DASHBOARD);
    }
  }, [isAuthenticated, navigate]);

const handleSignIn = async () => {
  try {
    setLoading(true);
    setError(null);

    // 1) Auth OAuth
    await signIn();

    // 2) (optionnel mais recommandé) récupérer userinfo pour avoir l'email
    // await authService.getUserInfo(); // si vous exposez authService ou si useAuth le fait déjà

    // 3) Test minimal Sheets
    const cfg = await googleSheetsService.getConfig();
    console.log("✅ Google Sheets OK - Config:", cfg);

    // 4) Navigation
    navigate(ROUTES.DASHBOARD);
  } catch (err) {
    console.error("❌ Test OAuth/Sheets échoué:", err);
    setError(err?.message || "Erreur lors de l'authentification / accès Sheets");
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="container container-sm" style={{ paddingTop: "4rem" }}>
      <div className="card text-center">
        <div
          style={{
            background: "linear-gradient(135deg, #0055A4 0%, #003D7A 100%)",
            color: "white",
            padding: "2rem",
            borderRadius: "0.5rem 0.5rem 0 0",
            marginTop: "-1.5rem",
            marginLeft: "-1.5rem",
            marginRight: "-1.5rem",
            marginBottom: "2rem",
          }}
        >
          <h1 style={{ color: "white", margin: "0 0 0.5rem 0" }}>
            Élections Municipales 2026
          </h1>
          <p style={{ margin: 0, opacity: 0.9 }}>{ELECTION_CONFIG.COMMUNE_NAME}</p>
        </div>

        <div style={{ padding: "1rem" }}>
          <h2>Connexion requise</h2>
          <p className="text-muted">
            Authentifiez-vous avec votre compte Google pour accéder à l'application de gestion électorale.
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="btn btn-primary"
            style={{ marginTop: "2rem" }}
          >
            {loading ? "Connexion en cours..." : "Se connecter avec Google"}
          </button>

          <div
            style={{
              marginTop: "3rem",
              paddingTop: "2rem",
              borderTop: "1px solid var(--color-gray-200)",
            }}
          >
            <h3>Informations</h3>
            <div style={{ textAlign: "left", marginTop: "1rem" }}>
              <p>
                <strong>1er tour :</strong> {ELECTION_CONFIG.ELECTION_DATE_T1}
              </p>
              <p>
                <strong>2nd tour :</strong> {ELECTION_CONFIG.ELECTION_DATE_T2}
              </p>
              <p>
                <strong>Horaires :</strong> {ELECTION_CONFIG.VOTING_HOURS_START} -{" "}
                {ELECTION_CONFIG.VOTING_HOURS_END}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
