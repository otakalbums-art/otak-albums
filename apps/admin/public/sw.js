// Service worker для push-сповіщень адмінки (packages/push/src/index.ts шле
// сюди payload {title, body, url}). Мінімальний — жодного офлайн-кешування
// навмисно, лише прийом push і клік по сповіщенню.

self.addEventListener("push", (event) => {
  let data = { title: "Otak Albums", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // ignore — покажемо дефолтне
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
