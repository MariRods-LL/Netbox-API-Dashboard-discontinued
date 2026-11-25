const statusDiv = document.getElementById("status");

function setStatus(message, type = "info") {
  const status = document.createElement("div");
  status.style.position = "fixed";
  status.style.top = "20px";
  status.style.right = "20px";
  status.style.padding = "15px 20px";
  status.style.borderRadius = "4px";
  status.style.zIndex = "9999";
  status.style.maxWidth = "300px";

  if (type === "success") {
    status.style.backgroundColor = "#4CAF50";
    status.style.color = "white";
  } else if (type === "error") {
    status.style.backgroundColor = "#f44336";
    status.style.color = "white";
  } else {
    status.style.backgroundColor = "#2196F3";
    status.style.color = "white";
  }

  status.innerText = message;
  document.body.appendChild(status);

  setTimeout(() => {
    status.remove();
  }, 3000);
}

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (!username || !password) {
    setStatus("Por favor, preencha usuário e senha", "error");
    return;
  }

  try {
    setStatus("Autenticando...", "info");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      setStatus(data.message || "Erro na autenticação", "error");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    setStatus("Login realizado com sucesso!", "success");

    setTimeout(() => {
      window.location.href = "/dashboard.html";
    }, 1500);
  } catch (err) {
    console.error(err);
    setStatus(`Erro: ${err.message}`, "error");
  }
}

function checkAuth() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login";
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

function getAuthToken() {
  return localStorage.getItem("token");
}

function isAuthenticated() {
  return !!localStorage.getItem("token");
}

function getUser() {
  const userStr = localStorage.getItem("user");
  return userStr ? JSON.parse(userStr) : null;
}

async function makeAuthenticatedRequest(url, options = {}) {
  const token = getAuthToken();

  if (!token) {
    logout();
    throw new Error("Não autenticado");
  }

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

window.addEventListener("load", () => {
  const currentPage = window.location.pathname;

  if (currentPage !== "/login" && !isAuthenticated()) {
    window.location.href = "/login";
  }
});

document.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && window.location.pathname === "/login") {
    login();
  }
});
