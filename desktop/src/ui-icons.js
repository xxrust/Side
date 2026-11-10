import './ui-icons.css';

// Shared, local SVG glyphs keep the drawing tools legible at every display scale.
const paths={
 chart:'<path d="M4 3v17h17M8 16v-5m5 5V6m5 10V9"/>',
 history:'<path d="M4 12a8 8 0 1 0 2.4-5.7M4 3v4h4M12 7v5l3 2"/>',
 arrange:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' ,
 connect:'<rect x="2" y="3" width="7" height="6" rx="1"/><rect x="15" y="15" width="7" height="6" rx="1"/><path d="M6 9v9h9m-3-3 3 3-3 3"/>',
 ask:'<path d="M4 4h16v12H9l-5 4z"/><path d="M10 8a2 2 0 0 1 4 0c0 2-2 1-2 3M12 13v1"/>',
 distance:'<path d="M3 6v12M21 6v12M3 12h18m-4-4 4 4-4 4M7 8l-4 4 4 4"/>',
 select:'<path d="m5 3 14 9-7 1-3 7z"/>',
 pen:'<path d="m13 3 8 8-5 9-8 1-5-5 1-8zM3 21l7-7M13 3l-3 7 4 4 7-3"/><circle cx="12" cy="12" r="2"/>',
 mask:'<path stroke-dasharray="3 3" d="M8 3 3 7l1 11 7 3 10-6-2-10Z"/><path fill="currentColor" fill-opacity=".25" stroke="none" d="M8 3 3 7l1 11 7 3 10-6-2-10Z"/>',
 rect:'<rect x="4" y="5" width="16" height="14" rx="1"/>',
 ellipse:'<ellipse cx="12" cy="12" rx="9" ry="7"/>',
 line:'<path d="m5 19 14-14"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
 arrow:'<path d="M4 20 20 4M9 4h11v11"/>',
 text:'<path d="M4 7V4h16v3M12 4v16M8 20h8"/>',
 undo:'<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(0 -2)"/>',
 redo:'<path d="m16 5 5 5-5 5M21 10H10a6 6 0 0 0 0 12" transform="translate(0 -2)"/>',
 delete:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
 fit:'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
 'fit-selected':'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><path d="m8 8 8 5-4 .5-1.5 4z"/>',
 'zoom-in':'<path d="M5 12h14M12 5v14"/>',
 'zoom-out':'<path d="M5 12h14"/>',
 'rotate-left':'<path d="M9 5H4v5M4 10a8 8 0 1 0 2.3-5.7L4 6"/>',
 'rotate-right':'<path d="M15 5h5v5M20 10a8 8 0 1 1-2.3-5.7L20 6"/>',
 'new-project':'<path d="M5 3h10l4 4v14H5zM15 3v5h5"/><path d="M8 15h8M12 11v8"/>',
 'message-plus':'<path d="M4 4h16v12H9l-5 4z"/><path d="M12 7v6M9 10h6"/>',
 expand:'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
 contract:'<path d="M9 9H3v6M15 9h6v6"/>'
};
Object.assign(paths,{
 fullscreen:'<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
 add:'<path d="M12 4v16M4 12h16"/>',
 images:'<rect x="6" y="3" width="15" height="15" rx="2"/><path d="M3 7v14h14M7 15l4-5 3 3 3-4 3 6"/><circle cx="11" cy="7" r="1"/>',
 import:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
 export:'<path d="M12 15V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
 collapse:'<path d="m9 5 7 7-7 7M21 4v16"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 save:'<path d="M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8"/>',
 folder:'<path d="M3 7V4h6l3 3h9v14H3z"/>',
 file:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 13h8M8 17h8"/>',
 edit:'<path d="m16 3 5 5-12 12-6 1 1-6zM13 6l5 5"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 3M12 17h.01"/>',
 previous:'<path d="m15 5-7 7 7 7"/>',
 next:'<path d="m9 5 7 7-7 7"/>',
 compare:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M5 15l4-5M15 15l4-5"/>',
 overlay:'<rect x="3" y="3" width="12" height="12" rx="1"/><rect x="9" y="9" width="12" height="12" rx="1"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/>',
 rerun:'<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6"/>',
 'find-line':'<path stroke-dasharray="2 3" d="M3 3h18v18H3z"/><path d="m5 17 14-10"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="9" r="1"/>',
 'find-circle':'<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1"/>',
 chart:'<path d="M3 3v18h18M6 16l4-6 4 3 6-8"/>',
 sheet:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 9v12"/>',
 quote:'<path d="M10 5H4v8h5c0 3-2 5-5 6M20 5h-6v8h5c0 3-2 5-5 6"/>',
 'dock-right':'<path d="M4 3h16v18H4zM16 3v18M8 12h5m-2-3 3 3-3 3"/>'
});

export function iconButton(button,icon,label,shortcut=''){
 if(!paths[icon])throw Error(`未知的圖示：${icon}`);
 button.classList.add('icon-button');button.dataset.icon=icon;
 button.title=shortcut?`${label} (${shortcut})`:label;
 button.setAttribute('aria-label',shortcut?`${label} ${shortcut}`:label);
 button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[icon]}</svg>`;
 return button;
}

export function iconLabelButton(button,icon,label=button.textContent){
 iconButton(button,icon,label);button.classList.remove('icon-button');button.classList.add('icon-label-button');
 const text=document.createElement('span');text.textContent=label;button.append(text);return button;
}
