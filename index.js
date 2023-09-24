import ally from 'ally.js';
import rgbHex from 'rgb-hex';
import { Chart } from 'chart.js';
import * as Chartjs from "chart.js";
const controllers = Object.values(Chartjs).filter(
    (chart) => chart.id !== undefined
);

Chart.register(...controllers);

async function main() {
    const data = new Map(); // Информация о доступности всех обработанных элементов

    function RGBToHex(rgba, node) {
        const numbers = rgba.split(', ');
        const r = parseInt(numbers[0]);
        const g = parseInt(numbers[1]);
        const b = parseInt(numbers[2]);
        if (numbers[3] && parseInt(numbers[3]) < 0.5) {
            if (!data.has(node)) {
                data.set(node, { transparentText: true });
            } else {
                const oldInfo = data.get(node);
                data.set(node, { ...oldInfo, transparentText: true })
            }
        }
        return rgbHex(r, g, b);
    }
    function getCSS(node, prop) {
        const style = window.getComputedStyle(node);
        let result = style.getPropertyValue(prop);
        if (prop == 'background-color' && result == 'rgba(0, 0, 0, 0)') {
            result = getCSS(node.parentNode, prop); // Если у элемента прозрачный фон, рекурсивно узнать фон родителя
        }
        if (/rgb\(/.test(result) || /rgba\(/.test(result)) {
            result = RGBToHex(result, node);
        }
        return result;
    }

    function isTextNode(node) {
        return node.nodeType == 3;
    }

    function pxToRem(px, base = 16) {
        const rem = parseInt(px.replace('px', ''));
        const i = parseFloat(((1 / base) * rem).toFixed(3))
        return i + 'rem';
    }

    function getPx(px) {
        return px.replace('px', '');
    }

    function findTextNodesIn(el) {
        var n, a = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        while (n = walk.nextNode()) a.push(n);
        return a;
    }

    // 1. Проверка контрастности текста
    const textNodes = findTextNodesIn(document.body);

    // Добавление элементов, в которых пока может не быть текста
    const tagsWithText = ['input', 'textarea'];
    for (let tag of tagsWithText) {
        const elements = document.querySelectorAll(tag);
        for (let element of elements) {
            textNodes.push(element);
        }
    }
    const imgs = document.querySelectorAll('img');
    for (let element of imgs) {
        // textNodes.push(element);
        data.set(element, { hasAlt: element.hasAttribute('alt'), type: {hasText: false, isFocusable: false} });
    }
    const promises = new Map();
    async function getContrast(node) {
        const background = getCSS(node, "background-color");
        const color = getCSS(node, "color");
        const font = getCSS(node, "font-size");
        if (background && color) {
            let response = await fetch(`https://webaim.org/resources/contrastchecker/?fcolor=${color}&bcolor=${background}&api`);
            if (response.ok) {
                let contrast = await response.json();
                const isFocusable = ally.is.focusable(node);
                return [node, {
                    type: {
                        hasText: true,
                        isFocusable,
                    }, contrast, background, color, font
                }];
            } else {
                console.log("Error HTTP: " + response.status);
            }
        }
    }

    async function getLinkContrast(node) {
        const color = getCSS(node, 'color');
        const background = getCSS(node, 'background-color');
        const textColor = getCSS(node.parentNode, 'color');
        const font = getCSS(node, "font-size").replace(/\d+/, '');
        let response = await fetch(`https://webaim.org/resources/linkcontrastchecker/?fcolor=${textColor}&bcolor=${background}&lcolor=${color}&api`);
        if (response.ok) {
            let contrast = await response.json();
            const isFocusable = ally.is.focusable(node);
            return [node, {
                type: {
                    hasText: true,
                    isFocusable,
                }, contrast, background, color, font, textColor
            }];
        } else {
            console.log("Error HTTP: " + response.status);
        }
    }

    async function setInfo(textNode) {
        if (textNode.parentNode.tagName == 'A') { // Обработка ссылок
            const link = textNode.parentNode;
            if ((link.nextSibling && isTextNode(link.nextSibling)) || (link.previousSibling && isTextNode(link.previousSibling))) {
                let [node, result] = await getLinkContrast(link);
                promises.set(node, result);
            } else {
                let [node, result] = await getContrast(link);
                promises.set(node, result);
            }
        } else { // Обработка остальных текстовых элементов
            const element = textNode.parentNode;
            let [node, result] = await getContrast(element);
            promises.set(node, result);
        }
    }

    // Обработка всех текстовых элементов
    for (const node of textNodes) {
        await setInfo(node);
    }

    // Получение всех результатов
    const allResults = async function (...args) {
        const all = await Promise.all(args);
        return all;
    };
    let results = await allResults(promises);

    // Добавление результатов в общее хранилище
    for (let [node, info] of results[0]) {
        if (!data.has(node)) {
            data.set(node, info);
        } else {
            const oldInfo = data.get(node);
            data.set(node, { ...oldInfo, ...info })
        }
    }

    // 2. Проверка стилей фокусируемых элементов
    const elements = ally.query.focusable({
        context: '.wrapper',
        includeContext: true,
        includeOnlyTabtable: true,
        strategy: 'quick',
    });

    for (let node of elements) {
        node.focus();
        const outline = getCSS(node, 'outline');
        let hasText = false;
        let hasImg = false;
        let isImgHasAria = false;
        let hasAria = node.hasAttribute('aria-label');
        const hasFocusOutline = !/none/.test(outline)

        for (let child of node.childNodes) {
            if (isTextNode(child)) {
                hasText = true;
            } else if (child.tagName == 'SVG' || child.tagName == 'IMG') {
                hasImg = true;
                if (child.hasAttribute('aria-hidden')) {
                    isImgHasAria = true;
                }
            }
        }
        const info = {
            type: {
                hasText,
                isFocusable: true,
            },
            hasFocusOutline,
            hasAria,
            hasImg,
            isImgHasAria
        };

        // Добавление результатов в общее хранилище
        if (!data.has(node)) {
            data.set(node, info);
        } else {
            const oldInfo = data.get(node);
            data.set(node, { ...oldInfo, ...info })
        }
    }

    const modals = new Map();
    const chartData = {
        okAll: 0,
        ok: 0,
        warning: 0,
        danger: 0,
    };
    // Отображение результатов
    const renderResult = (node, info) => {
        let modalData;
        const modalLiStyle = `margin-bottom: 15px; list-style: initial; list-style-type: disc;`;
        const modalSpanStyle = `font-weight: 700;`;

        const data = {};

        function okAll(node) {
            data.status = 'okAll';
            node.style.border = `5px solid #2FB176`;
            node.style.cursor = 'pointer';
            chartData.okAll += 1;
        }

        function ok(node) {
            data.status = 'ok';
            node.style.border = `5px solid #6BDF69`;
            node.style.cursor = 'pointer';
            chartData.ok += 1;
        }

        function warning(node) {
            data.status = 'warning';
            node.style.border = `5px solid #F1AF61`;
            node.style.cursor = 'pointer';
            chartData.warning += 1;
        }

        function danger(node) {
            data.status = 'danger';
            node.style.border = `5px solid #F16161`;
            node.style.cursor = 'pointer';
            chartData.danger += 1;
        }

        // Обработка нефокусируемых узлов, содержащих текст
        if (info.type.hasText && !info.type.isFocusable) {
            let warnings = '';
            const fontSize = getPx(getCSS(node, 'font-size'));
            const isLarge = fontSize >= 18 || (fontSize >= 14 && (getCSS(node, 'font-weight') === 'bold') || parseInt(getCSS(node, 'font-weight')) >= 700);
            data.isLarge = isLarge;
            if (isLarge) {
                data.contrast = info.contrast.AALarge == 'pass';
                data.AAAcontrast = info.contrast.AAALarge == 'pass';
            } else {
                data.contrast = info.contrast.AA == 'pass';
                data.AAAcontrast = info.contrast.AAA == 'pass';
            }
            data.ratio = info.contrast.ratio;
            if (!data.contrast || info.hasOwnProperty('transparentText')) {
                danger(node);
            } else if (fontSize <= 13) {
                warning(node);
            } else if (!data.AAAcontrast) {
                ok(node);
            } else if (data.AAAcontrast) {
                okAll(node);
            }

            if (data.status === 'danger') {
                if (isLarge) {
                    warnings += `
                        <li style="${modalLiStyle}">
                            Размер текста больше/равен 18px или меньше/равен 14px при font-weight больше/равном 700, поэтому для него действуют правила для крупного текста. 
                            Уровень AA WCAG требует коэффициента контрастности не менее 4,5:1 для обычного текста и 3:1 для крупного текста. 
                            Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span>
                        </li>
                    `;
                } else {
                    warnings += `
                        <li style="${modalLiStyle}">
                            Уровень AA WCAG требует коэффициента контрастности не менее 4,5:1 для обычного текста.
                            Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span>
                        </li>
                    `;
                }
                if (info.hasOwnProperty('transparentText')) {
                    warnings += `
                        <li style="${modalLiStyle}">Прозрачность текста менее 50%: низкая контрастность с фоном.</li>
                    `;
                }
            }
            if (fontSize <= 13) {
                warnings += `
                    <li style="${modalLiStyle}">Предупреждение: размер шрифта менее 14px, он может быть плохо виден.</li>
                `;
            }
            if (data.status == 'ok') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AA WCAG. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            } else if (data.status == 'okAll') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AAA WCAG, это наивысший возможный уровень соответствия. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            }
            modalData = warnings;
        }

        // Обработка фокусируемых узлов, не содержащих текст
        if (!info.type.hasText && info.type.isFocusable) {
            let warnings = '';
            data.hasFocusOutline = info.hasFocusOutline;
            data.notImgAria = false;
            if (((node.tagName == 'A' || node.tagName == 'BUTTON') && info.hasImg && !info.isImgHasAria) || !info.hasAria) {
                data.notImgAria = true;
            }
            data.isImgHasAria = info.isImgHasAria;

            if (!data.isImgHasAria) {
                danger(node);
            } else if (!data.hasFocusOutline || data.notImgAria) {
                warning(node);
            } else {
                ok(node);
            }

            if (data.status === 'danger') {
                warnings += `
                    <li style="${modalLiStyle}">
                        У этого элемента нет текста внутри, а также нет атрибута "aria-label". 
                        Программа чтения с экрана не поймет, для чего нужен этот элемент. 
                        На него можно наставить фокус, но его предназначение не указано. 
                    </li>
                    <li style="${modalLiStyle}">
                        Необходимо добавить атрибут aria-label с указанием роли элемента (пример: aria-label="Search"), 
                        либо написать его текстом внутри элемента (пример: "&#60;button&#62;Search&#60;/button	&#62;")
                    </li>
                `;
            }
            if (!data.hasFocusOutline) {
                warnings += `
                    <li style="${modalLiStyle}">У этого элемента нет выделения (с помощью свойства outline) в состоянии фокуса. 
                    Доступность элемента с помощью клавиатуры низкая.</li>
                `;
            }
            if (data.notImgAria) {
                warnings += `
                    <li style="${modalLiStyle}">
                        У этого элемента нет текста внутри, однако есть декоративный дочерний элемент (svg или img). 
                        К svg необходимо добавить добавить атрибут aria-hidden="true", а к img alt="" (пустая строка), чтобы программа чтения с экрана не останавливалась на них.
                        Если дочерний элемент не является декоративным, добавьте к нему атрибут "alt" с описанием.
                    </li>
                `;
            }
            if (data.status == 'ok') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует основным требованиям доступности.</li>
                `;
            }
            modalData = warnings;
        }


        // Обработка фокусируемых узлов, содержащих текст
        if (info.type.hasText && info.type.isFocusable && !info.hasOwnProperty('textColor')) {
            let warnings = '';
            const fontSize = getPx(getCSS(node, 'font-size'));
            const isLarge = fontSize >= 18 || (fontSize >= 14 && (getCSS(node, 'font-weight') === 'bold') || parseInt(getCSS(node, 'font-weight')) >= 700);
            data.isLarge = isLarge;
            if (isLarge) {
                data.contrast = info.contrast.AALarge == 'pass';
                data.AAAcontrast = info.contrast.AAALarge == 'pass';
            } else {
                data.contrast = info.contrast.AA == 'pass';
                data.AAAcontrast = info.contrast.AAA == 'pass';
            }
            data.ratio = info.contrast.ratio;
            data.hasFocusOutline = info.hasFocusOutline;
            data.notImgAria = false;
            if ((node.tagName == 'A' || node.tagName == 'BUTTON') && info.hasImg && !info.isImgHasAria) {
                data.notImgAria = true;
            }

            if (!data.contrast || info.hasOwnProperty('transparentText')) {
                danger(node);
            } else if (fontSize <= 13 || !data.hasFocusOutline || data.notImgAria) {
                warning(node);
            } else if (!data.AAAcontrast) {
                ok(node);
            } else if (data.AAAcontrast) {
                okAll(node);
            }

            if (data.status === 'danger') {
                if (isLarge) {
                    warnings += `
                        <li style="${modalLiStyle}">
                            Размер текста больше/равен 18px или меньше/равен 14px при font-weight больше/равном 700, поэтому для него действуют правила для крупного текста. 
                            Уровень AA WCAG требует коэффициента контрастности не менее 4,5:1 для обычного текста и 3:1 для крупного текста. 
                            Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span>
                        </li>
                    `;
                } else {
                    warnings += `
                        <li style="${modalLiStyle}">
                            Уровень AA WCAG требует коэффициента контрастности не менее 4,5:1 для обычного текста.
                            Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span>
                        </li>
                    `;
                }
                if (info.hasOwnProperty('transparentText')) {
                    warnings += `
                        <li style="${modalLiStyle}">Прозрачность текста менее 50%: низкая контрастность с фоном.</li>
                    `;
                }
            }
            if (fontSize <= 13) {
                warnings += `
                    <li style="${modalLiStyle}">Предупреждение: размер шрифта менее 13px, он может быть плохо виден.</li>
                `;
            }
            if (!data.hasFocusOutline) {
                warnings += `
                    <li style="${modalLiStyle}">У этого элемента нет выделения (с помощью свойства outline) в состоянии фокуса. 
                    Доступность элемента с помощью клавиатуры низкая.</li>
                `;
            }
            if (data.notImgAria) {
                warnings += `
                    <li style="${modalLiStyle}">
                        У этого элемента есть текст внутри, однако также есть декоративный дочерний элемент (svg или img). 
                        К svg необходимо добавить добавить атрибут aria-hidden="true", а к img alt="" (пустая строка), чтобы программа чтения с экрана не останавливалась на них.
                        Если дочерний элемент не является декоративным, добавьте к нему атрибут "alt" с описанием.
                    </li>
                `;
            }
            if (data.status == 'ok') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AA WCAG. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            } else if (data.status == 'okAll') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AAA WCAG, это наивысший возможный уровень соответствия. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            }
            modalData = warnings;
        }

        if (node.tagName == 'input' || node.tagName == 'textarea') {
            let warnings = '';
            const fontSize = getPx(getCSS(node, 'font-size'));
            const isLarge = fontSize >= 18 || (fontSize >= 14 && (getCSS(node, 'font-weight') === 'bold') || parseInt(getCSS(node, 'font-weight')) >= 700);
            data.isLarge = isLarge;
            if (isLarge) {
                data.contrast = info.contrast.AALarge == 'pass';
                data.AAAcontrast = info.contrast.AAALarge == 'pass';
            } else {
                data.contrast = info.contrast.AA == 'pass';
                data.AAAcontrast = info.contrast.AAA == 'pass';
            }
            data.ratio = info.contrast.ratio;
            data.hasFocusOutline = info.hasFocusOutline;

            if (!data.contrast || info.hasOwnProperty('transparentText') || (!node.hasAttribute('title') || !node.hasAttribute('aria-label') || !node.hasAttribute('aria-labelby'))) {
                danger(node);
            } else if (fontSize <= 13 || !data.hasFocusOutline || data.notImgAria) {
                warning(node);
            } else if (!data.AAAcontrast) {
                ok(node);
            } else if (data.AAAcontrast) {
                okAll(node);
            }

            if (data.status === 'danger') {
                if (isLarge) {
                    warnings += `
                        <li style="${modalLiStyle}">
                            Размер текста больше/равен 18px или меньше/равен 14px при font-weight больше/равном 700, поэтому для него действуют правила для крупного текста. 
                            Уровень AA WCAG требует коэффициента контрастности не менее 4,5:1 для обычного текста и 3:1 для крупного текста. 
                            Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span>
                        </li>
                    `;
                } else {
                    warnings += `
                        <li style="${modalLiStyle}">
                            Уровень AA WCAG требует коэффициента контрастности не менее 4,5:1 для обычного текста.
                            Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span>
                        </li>
                    `;
                }
                if (info.hasOwnProperty('transparentText')) {
                    warnings += `
                        <li style="${modalLiStyle}">Прозрачность текста менее 50%: низкая контрастность с фоном.</li>
                    `;
                }
                if (!node.hasAttribute('title') || !node.hasAttribute('aria-label') || !node.hasAttribute('aria-labelby')) {
                    warnings += `
                        <li style="${modalLiStyle}">Чтобы программы чтения с экрана могли распозоновать предназначение конкретного элемента ввода текта,
                        необходимо указать один из атрибутов: "title", "aria-label", "aria-labelby".
                        </li>
                    `;
                }
            }
            if (fontSize <= 13) {
                warnings += `
                    <li style="${modalLiStyle}">Предупреждение: размер шрифта менее 13px, он может быть плохо виден.</li>
                `;
            }
            if (!data.hasFocusOutline) {
                warnings += `
                    <li style="${modalLiStyle}">У этого элемента нет выделения (с помощью свойства outline) в состоянии фокуса. 
                    Доступность элемента с помощью клавиатуры низкая.</li>
                `;
            }
            if (data.status == 'ok') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AA WCAG. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            } else if (data.status == 'okAll') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AAA WCAG, это наивысший возможный уровень соответствия. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            }
            modalData = warnings;
        }

        // Обработка ссылок внутри текста (содержит textColor)
        if (info.type.hasText && info.type.isFocusable && info.hasOwnProperty('textColor')) {
            const style = window.getComputedStyle(node);
            let result = style.getPropertyValue('text-decoration');
            const hasUnderline = /underline/.test(result);
            let warnings = '';
            const fontSize = getPx(getCSS(node, 'font-size'));
            const fail = info.contrast["Link to Body Text"].conformance === 'fail'
                || info.contrast["Link to Background"].conformance === 'fail'
                || info.contrast["Body Text to Background"].conformance === 'fail';
            data.ratio = info.contrast.ratio;
            data.hasFocusOutline = info.hasFocusOutline;
            data.notImgAria = false;
            if ((node.tagName == 'A' || node.tagName == 'BUTTON') && info.hasImg && !info.isImgHasAria) {
                data.notImgAria = true;
            }
            if ((fail && !hasUnderline) || info.hasOwnProperty('transparentText')) {
                danger(node);
            } else if (fontSize <= 13 || !data.hasFocusOutline || data.notImgAria) {
                warning(node);
            } else if (!data.AAAcontrast) {
                ok(node);
            } else if (data.AAAcontrast) {
                okAll(node);
            }

            warnings += `
                <li style="${modalLiStyle}">
                    Этот элемент является ссылкой внутри текста. Для таких элементов по правилам WCAG оценивается контраст не только цвета элемента и фона, 
                    но и цвета элемента и окружающего текста, и цвета окружающего текста и фона.
                </li>
                <li style="${modalLiStyle}">
                    Для удобства использования и доступности ссылки по умолчанию должны быть подчеркнуты. В противном случае текст ссылки должен иметь контраст как минимум 3:1 с окружающим основным текстом и должен иметь нецветной индикатор (обычно подчеркивание) при наведении курсора мыши и фокусе клавиатуры.
                </li>
            `;

            if (info.contrast["Link to Body Text"].conformance === 'fail' && !hasUnderline) {
                warnings += `
                    <li style="${modalLiStyle}">
                        Ссылка не имеет графического выделения с помощью подчеркивания.
                    </li>
                    <li style="${modalLiStyle}">
                        Необходимо повысить контраст ссылки относительно окружающего текста, либо выделить ссылку с помощью подчеркивания (text-decoration: underline).
                        Коэффициент контрастности ссылки относительно окружающего текста: <span style="${modalSpanStyle}">${info.contrast["Link to Body Text"].ratio}</span>
                    </li>
                `;
            } else {
                warnings += `
                    <li style="${modalLiStyle}">
                        Коэффициент контрастности ссылки относительно окружающего текста: <span style="${modalSpanStyle}">${info.contrast["Link to Body Text"].ratio}</span>
                    </li>
                `;
            };

            if (info.contrast["Link to Background"].conformance === 'fail' && !hasUnderline) {
                warnings += `
                    <li style="${modalLiStyle}">
                        Ссылка не имеет графического выделения с помощью подчеркивания.
                    </li>
                    <li style="${modalLiStyle}">
                        Необходимо повысить контраст ссылки относительно фона.
                        Коэффициент контрастности ссылки относительно фона: <span style="${modalSpanStyle}">${info.contrast["Link to Background"].ratio}</span>
                    </li>
                `;
            } else {
                warnings += `
                    <li style="${modalLiStyle}">
                        Коэффициент контрастности ссылки относительно фона: <span style="${modalSpanStyle}">${info.contrast["Link to Background"].ratio}</span>
                    </li>
                `;
            }

            if (info.contrast["Body Text to Background"].conformance === 'fail' && !hasUnderline) {
                warnings += `
                    <li style="${modalLiStyle}">
                        Ссылка не имеет графического выделения с помощью подчеркивания.
                    </li>
                    <li style="${modalLiStyle}">
                        Необходимо повысить контраст окружающего текста относительно фона.
                        Коэффициент контрастности окружающего текста относительно фона: <span style="${modalSpanStyle}">${info.contrast["Body Text to Background"].ratio}</span>
                    </li>
                `;
            } else {
                warnings += `
                    <li style="${modalLiStyle}">
                        Коэффициент контрастности этого окружающего относительно фона: <span style="${modalSpanStyle}">${info.contrast["Body Text to Background"].ratio}</span>
                    </li>
                `;
            }

            if (info.hasOwnProperty('transparentText')) {
                warnings += `
                    <li style="${modalLiStyle}">Прозрачность текста менее 50%: низкая контрастность с фоном.</li>
                `;
            }
            if (fontSize <= 13) {
                warnings += `
                    <li style="${modalLiStyle}">Предупреждение: размер шрифта менее 13px, он может быть плохо виден.</li>
                `;
            }
            if (!data.hasFocusOutline) {
                warnings += `
                    <li style="${modalLiStyle}">У этого элемента нет выделения (с помощью свойства outline) в состоянии фокуса. 
                    Доступность элемента с помощью клавиатуры низкая.</li>
                `;
            }
            if (data.notImgAria) {
                warnings += `
                    <li style="${modalLiStyle}">
                        У этого элемента есть текст внутри, однако также есть декоративный дочерний элемент (svg или img). 
                        К svg необходимо добавить добавить атрибут aria-hidden="true", а к img alt="" (пустая строка), чтобы программа чтения с экрана не останавливалась на них.
                        Если дочерний элемент не является декоративным, добавьте к нему атрибут "alt" с описанием.
                    </li>
                `;
            }
            if (data.status == 'ok') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AA WCAG. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            } else if (data.status == 'okAll') {
                warnings += `
                    <li style="${modalLiStyle}">Текст соотвествует уровню AAA WCAG, это наивысший возможный уровень соответствия. Коэффициент контрастности этого текста: <span style="${modalSpanStyle}">${data.ratio}</span></li>
                `;
            }
            modalData = warnings;
        }


        // Обработка нефокусируемых узлов, не содержащих текст
        if (!info.type.hasText && !info.type.isFocusable) {
            let warnings = ''
            if (!info.hasAlt) {
                danger(node);
            } else {
                ok(node);
            };

            if (data.status === 'danger') {
                warnings += `
                    <li style="${modalLiStyle}">
                        У этого изображения нет абтрибута alt. Добавьте описание в alt, чтобы оно было доступно пользователям, которые используют программы чтения с экрана.
                    </li>
                `;
            } else {
                warnings += `
                <li style="${modalLiStyle}">
                 Изображение соответствует требованиям доступности
                </li>
            `;
            }
            modalData = warnings;
        }


        let textStatus;
        let statusInfo;
        let borderStatus;
        if (data.status === 'okAll') {
            textStatus = '#29A76E';
            borderStatus = '#2FAB73';
            statusInfo = `Этот элемент соответствует наиболее высокому уровню требований доступности.`;
        } else if (data.status === 'ok') {
            textStatus = '#38CD35';
            borderStatus = '#51D94F';
            statusInfo = `Этот элемент соответствует требованиям доступности.`;
        } if (data.status === 'warning') {
            textStatus = '#ED8B18';
            borderStatus = '#F8941E';
            statusInfo = `Этот элемент соответствует минимальным требованиям доступности, но необходимо исправить некоторые парметры.`
        } if (data.status === 'danger') {
            textStatus = '#E92121';
            borderStatus = '#FF2828';
            statusInfo = `Этот элемент не соответствует минимальным требованиям доступности.`
        }
        // Создание модального окна с информацией
        const modalBgStyle = `display: none; position: fixed; z-index: 3000; padding-top: 100px; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgb(0,0,0); background-color: rgba(0,0,0,0.4);`;
        const modalContentStyle = `z-index: 3001; border-radius: 10px; border: 5px solid ${borderStatus}; background: #FFFFFF; padding: 20px; margin: auto; width: 60%; height: fit-content;`;
        const modalHeaderStyle = `color: #111111; font-family: Arial, Helvetica, sans-serif; font-size: 18px;`;
        const modalStatusStyle = `color: ${textStatus}; font-size: 20px; font-style: normal; font-weight: 700;`;
        const modalListStyle = `list-style-position: inside; margin-left: 3%; list-style: initial; list-style-type: disc; color: #111111; font-family: Arial, Helvetica, sans-serif; font-size: 16px;`;
        const modalClose = `color: #111111; float: right; font-size: 28px; font-weight: bold;`;
        const modalText = `
            <div style='${modalContentStyle}'>
                <button type="button" class='modal-close' style='${modalClose}'>&times;</button>
                <p style='${modalHeaderStyle}'>Тип элемента: <span style="${modalSpanStyle}">${node.tagName.toLowerCase()}</span></p>
                <p style='${modalHeaderStyle}'>Статус: <span style='${modalStatusStyle}'>${data.status}</span></p>
                <p style='${modalHeaderStyle}'>${statusInfo}</p>
                <p style='${modalHeaderStyle}'>Информация о доступности: </p>
                <ul style='${modalListStyle}'>
                    ${modalData}
                </ul>
            </div>
        `;
        const modal = document.createElement('div');
        modal.style.cssText = modalBgStyle;
        modal.innerHTML = modalText;
        document.body.append(modal);
        modals.set(node, modal);
        const showModal = (e) => {
            e.preventDefault();
            const modal = modals.get(e.target);
            if (modal) {
                const close = modal.querySelector(".modal-close");
                modal.style.display = "block";
                close.onclick = function () {
                    modal.style.display = "none";
                }
                window.onclick = function (event) {
                    if (event.target == modal) {
                        modal.style.display = "none";
                    }
                }
            }
        }
        node.onclick = showModal;
    }
    for (let [node, info] of data) {
        if (node.getAttribute('id') != 'accessibility-button') {
            renderResult(node, info);
        }
    }

    // Отображение статистики в модальном окне
    function showReportModal(chartData) {
        const data = {
            labels: [
                'All OK',
                'OK',
                'Warning',
                'Danger'
            ],
            datasets: [{
                label: '',
                data: Object.values(chartData),
                backgroundColor: [
                    '#2FB176',
                    '#6BDF69',
                    '#F1AF61',
                    '#F16161',
                ],
                hoverOffset: 4
            }]
        };
        const config = {
            type: 'doughnut',
            options: {
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                return label
                            }
                        }
                    },
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            useBorderRadius: true,
                            borderRadius: 5,
                            boxWidth: 20,
                            boxHeight: 20,
                            padding: 20,
                            font: {
                                size: 16,
                            }
                        }
                    },
                },
            },
            data: data,
        };

        new Chart(
            document.getElementById('accessibility-chart'),
            config
        );
    }
    const mediaParams = [
        {
            maxWidth: 1200,
            chartWidth: 600,
            modalWidth: 60,
        },
        {
            maxWidth: 992,
            chartWidth: 500,
            modalWidth: 60,
        },
        {
            maxWidth: 768,
            chartWidth: 400,
            modalWidth: 70,
        },
        {
            maxWidth: 576,
            chartWidth: 400,
            modalWidth: 70,
        },
        {
            maxWidth: 480,
            chartWidth: 300,
            modalWidth: 90,
        },
    ];
    let chartWidth = 600;
    let modalWidth = 60;
    for (let param of mediaParams) {
        if (window.matchMedia(`(max-width: ${param.maxWidth}px)`).matches) {
            modalWidth = param.modalWidth;
            chartWidth = param.chartWidth;
        }
    }

    let reportInfo = '';

    if (chartData.danger > 0) {
        reportInfo = `На этой странице есть элементы, не соответствующие требованиям доступности WCAG. Они выделены красным. Исправьте их, чтобы повысить доступность сайта.`;
    } else if (chartData.warning > 0) {
        reportInfo = `На этой странице есть элементы, не совсем соответствующие требованиям доступности WCAG. Они выделены оранжевым. Исправьте их, чтобы повысить доступность сайта.`;
    } else if (chartData.ok > 0) {
        reportInfo = `Эта страница обладает хорошим уровнем доступности.`;
    } else if (chartData.okAll > 0) {
        reportInfo = `Эта страница обладает отличным уровнем доступности.`;
    }
    const reportBgStyle = `display: none; position: fixed; z-index: 4001; padding-top: 100px; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgb(0,0,0); background-color: rgba(0,0,0,0.4);`;
    const reportContentStyle = `z-index: 4002; border-radius: 10px; border: 5px solid #2FB176; background: #FFFFFF; padding: 30px; margin: auto; width: ${modalWidth}%; height: fit-content;`;
    const reportHeaderStyle = `color: #111111; font-family: Arial, Helvetica, sans-serif; font-size: 18px;`;
    const reportClose = `color: #111111; float: right; font-size: 28px; font-weight: bold;`;
    const reportTextStyle = `color: #111111; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 20px; margin-top: 20px;`;
    const reportText = `
                <div style='${reportContentStyle}'>
                    <button type="button" class='modal-close' style='${reportClose}'>&times;</button>
                    <p style='${reportHeaderStyle}'>Статистика доступности текстовых и интерактивных элементов страницы</span></p>
                    <div style="width: ${chartWidth}px; margin: auto; margin-top: 20px;"><canvas id="accessibility-chart"></canvas></div>
                    <p style='${reportTextStyle}'>${reportInfo}</span></p>
                </div>
            `;
    const reportModal = document.createElement('div');
    reportModal.style.cssText = reportBgStyle;
    reportModal.innerHTML = reportText;
    document.body.append(reportModal);

    const startBtn = document.getElementById('accessibility-button');
    startBtn.textContent = 'Перезагрузить страницу';
    startBtn.onclick = () => {
        window.location.reload();
    };
    const oldBtn = document.getElementById('report-accessibility-button');
    if (oldBtn) {
        oldBtn.parentElement.removeChild(oldBtn);
    }
    const reportButton = document.createElement('button');
    const getReport = (e) => {
        e.preventDefault();
        const modal = reportModal;
        const close = modal.querySelector(".modal-close");
        modal.style.display = "block";
        close.onclick = function () {
            modal.style.display = "none";
        }
        window.onclick = function (event) {
            if (event.target == modal) {
                modal.style.display = "none";
            }
        }
        showReportModal(chartData);
    };

    // Создание кнопки отчета
    const style = 'z-index: 4000; width: fit-content; height: fit-content; font-family: Arial, Helvetica, sans-serif; display: inline-flex; padding: 8px 10px; justify-content: center; align-items: center; border-radius: 8px; background: #1B8D50; color: #FFFFFF; text-align: center; font-size: 15px; font-weight: 700;';
    reportButton.setAttribute('id', 'report-accessibility-button');
    reportButton.style.cssText = style;
    reportButton.textContent = 'Показать отчет о доступности';
    reportButton.onclick = getReport;
    const wrapper = document.getElementById('accessibility-button-wrapper');
    wrapper.append(reportButton);
}

export const addAccessibilityButton = () => {
    const button = document.createElement('button');
    const btnWrapper = document.createElement('div');
    btnWrapper.setAttribute('id', 'accessibility-button-wrapper');
    const wrapperStyle = 'position: absolute; top: 20px; right: 20px; display: flex; justify-content: space-between; align-items: center; padding: 5px; gap: 10px; width: fit-content; height: fit-content;'
    btnWrapper.style.cssText = wrapperStyle;

    const start = () => {
        setTimeout(main, 1000);
        button.textContent = 'Загрузка...';
    };
    const style = 'z-index: 4000; width: fit-content; height: fit-content; font-family: Arial, Helvetica, sans-serif; display: inline-flex; padding: 8px 10px; justify-content: center; align-items: center; border-radius: 8px; background: #17CF6C; color: #FFFFFF; text-align: center; font-size: 15px; font-weight: 700;';
    button.setAttribute('id', 'accessibility-button');
    button.style.cssText = style;
    button.textContent = 'Проверить доступность';
    button.onclick = start;
    const oldBtn = document.getElementById('accessibility-button');
    const oldWrapper = document.getElementById('accessibility-button-wrapper');
    if (oldBtn) {
        oldBtn.parentNode.removeChild(oldBtn);
    }
    if (oldWrapper) {
        oldWrapper.parentNode.removeChild(oldWrapper);
    }
    document.body.append(btnWrapper);
    btnWrapper.append(button);
};