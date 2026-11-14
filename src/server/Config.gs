var CONFIG = {
  APP_NAME: 'Oren Song Writer',
  VERSION: '0.1.0',
  SCHEMA_VERSION: 1,

  SHEETS: {
    SONGS:          'Songs',
    SONG_DOCS:      'SongDocs',
    VERSIONS:       'Versions',
    PLAYLISTS:      'Playlists',
    PLAYLIST_SONGS: 'PlaylistSongs',
    TEMPLATES:      'Templates',
    SETTINGS:       'Settings',
    LISTS:          'Lists',
    ERRORS:         'Errors',
  },
};

var SHEET_COLS = {
  Songs:         ['SongID','Title','Writers','Status','Key','Capo','BPM','TimeSig','Language','Tags','Pinned','PinOrder','Rev','CreatedAt','UpdatedAt','DeletedAt','Notes','Preview'],
  SongDocs:      ['SongID','Part','Content','Rev','UpdatedAt'],
  Versions:      ['SongID','Rev','VersionName','Reason','CreatedAt','Content'],
  Playlists:     ['PlaylistID','Name','Description','Color','Private','SongOrder'],
  PlaylistSongs: ['PlaylistID','SongID','Position','DateAdded'],
  Templates:     ['TemplateID','Name','Structure','ChordProgression','IsBuiltIn','CreatedAt'],
  Settings:      ['Key','Value','UpdatedAt'],
  Lists:         ['Type','Value','Label','Order'],
  Errors:        ['Timestamp','Context','Error','Data','UserId'],
};

var SECTION_TYPES = [
  { type: 'intro',        label: 'פתיחה',       shortLabel: 'In',  color: '#a78bfa' },
  { type: 'verse',        label: 'בית',          shortLabel: 'V',   color: '#60a5fa' },
  { type: 'pre-chorus',   label: 'טרום-פזמון',   shortLabel: 'PC',  color: '#34d399' },
  { type: 'chorus',       label: 'פזמון',        shortLabel: 'C',   color: '#f97316' },
  { type: 'post-chorus',  label: 'הוק',          shortLabel: 'H',   color: '#fbbf24' },
  { type: 'bridge',       label: 'גשר',          shortLabel: 'B',   color: '#f472b6' },
  { type: 'instrumental', label: 'מעבר',         shortLabel: 'I',   color: '#94a3b8' },
  { type: 'outro',        label: 'סיום',         shortLabel: 'Out', color: '#a3e635' },
  { type: 'custom',       label: 'מותאם',        shortLabel: '',    color: '#e2e8f0' },
];

var SONG_STATUSES = ['draft', 'writing', 'done', 'archive'];

var FONTS_LYRICS  = ['Rubik','Heebo','Assistant','Noto Sans Hebrew','IBM Plex Sans Hebrew','Frank Ruhl Libre','Alef','Varela Round'];
var FONTS_CHORDS  = ['JetBrains Mono','IBM Plex Mono','Roboto Mono'];

var TEMPLATES_BUILTIN = [
  { id: 'tpl-vc',    name: 'Verse-Chorus',   structure: ['verse','chorus','verse','chorus','bridge','chorus'] },
  { id: 'tpl-pop',   name: 'Pop',            structure: ['verse','pre-chorus','chorus','verse','pre-chorus','chorus','bridge','chorus'] },
  { id: 'tpl-aaba',  name: 'AABA',           structure: ['verse','verse','bridge','verse'] },
  { id: 'tpl-12b',   name: 'בלוז 12 תיבות', structure: ['verse','verse','verse'] },
  { id: 'tpl-empty', name: 'ריק',            structure: [] },
];
