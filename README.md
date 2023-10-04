# Web accessibility checker

Плагин для определения веб-доступности элементов. 

## Функционал

- Определение контрастности текстовых элементов и элементов, которые могут содержать текст (например input, textarea);
- Определение размера шрифта и предупреждение, если он является слишком маленьким;
- Определение наличия атрибутов alt, aria-label, title там, где это необходимо;
- Определение наличия выделения фокусируемых элементов при фокусе (таких как button, a, input). Это необходимо для обеспечения доступа с клавиатуры.
- Составление сводной диаграммы доступности по итогу проверки всех элементов.

## Установка

```
npm i web-accessibility-checker --save
```

или
```
<script src="https://unpkg.com/web-accessibility-checker" type="module"></script>
```

## Использование

```
import { addAccessibilityButton } from 'web-accessibility-checker';
```
```
addAccessibilityButton();
```
После этого в правом верхнем углу экрана появится кнопка "Проверить доступность". Нажмите на нее и подождите несколько секунд, пока плагин сканирует элементы на странице.
После этого для каждого элемента появится выделение, соответствующее одному из следующих уровней:
- okAll - выделение темно-зеленым - элемент соотвествует уровню AAA WCAG;
- ok - выделение светло-зеленым - элемент соотвествует уровню AA WCAG;
- warning - выделение оранжевым - элемент не соотвествует уровню AA WCAG;
- danger- выделение красным - элемент не соотвествует уровню AA WCAG.

На каждый элемент можно нажать, чтобы узнать больше информации о его доступности. Также можно посмотреть общий отчет о доступности страницы.