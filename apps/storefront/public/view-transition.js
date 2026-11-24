// Выполняется в <head> до первой отрисовки каждой страницы витрины. Предыдущая
// страница запомнила, куда нажали (скрипт в Layout.astro). Если человек входит
// в каталог с другой страницы, motion.css раскрывает каталог шестигранной сотой
// из этой точки. Отдельный файл, а не встроенный скрипт: CSP разрешает
// только скрипты с этого же сайта.
(function () {
  // Фото товара перелетает из карточки на страницу товара. Имя для перелёта лежит в
  // data-transition-name и ставится через CSSOM: встроенный style запрещён CSP.
  function name() {
    var items = document.querySelectorAll('[data-transition-name]');
    for (var i = 0; i < items.length; i++) {
      items[i].style.viewTransitionName = items[i].getAttribute(
        'data-transition-name',
      );
    }
  }
  // Панель фильтров прокручивается сама; после выбора она открывается там же, где
  // была, а не сверху. Позицию запомнил скрипт страницы каталога.
  function filters() {
    try {
      var top = sessionStorage.getItem('bee:filters-scroll');
      var panel = document.querySelector('form[data-filters]');
      if (top === null || !panel) return;
      sessionStorage.removeItem('bee:filters-scroll');
      panel.scrollTop = Number(top);
    } catch (error) {
      // Без sessionStorage панель открывается сверху.
    }
  }
  window.addEventListener('pagereveal', function () {
    name();
    filters();
  });
  document.addEventListener('DOMContentLoaded', function () {
    name();
    filters();
  });
  try {
    var raw = sessionStorage.getItem('bee:transition');
    if (!raw) return;
    sessionStorage.removeItem('bee:transition');
    var from = JSON.parse(raw);
    if (!from || Date.now() - from.at > 5000) return;
    var root = document.documentElement;
    // Доли экрана в процентах, без единиц: CSS умножает их на 1vw и 1vh.
    root.style.setProperty('--vt-x', String(from.x));
    root.style.setProperty('--vt-y', String(from.y));
    var catalog = /^\/(ru|ro)\/catalog\/$/;
    if (catalog.test(location.pathname) && !catalog.test(from.path)) {
      root.setAttribute('data-transition', 'catalog');
    }
  } catch (error) {
    // Без sessionStorage страница открывается обычным переходом.
  }
})();
