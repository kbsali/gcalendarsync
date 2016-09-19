// Script to synchronize a calendar to a spreadsheet and vice versa.
//
// See https://github.com/Davepar/gcalendarsync for instructions on setting this up.
//
// Changelog (@kbsali) : the calendarIds objects allows you to set multiple calendars sync based on the sheet's names

// Set this value to match your calendarS!!!
// Calendar ID can be found in the "Calendar Address" section of the Calendar Settings.
var calendarIds = {
  'sheet1': 'CALENDAR_ID_1@group.calendar.google.com',
  'sheet2': 'CALENDAR_ID_2@group.calendar.google.com',
  'sheet2': 'CALENDAR_ID_3@group.calendar.google.com'
};

var titleRow = ['Title', 'Description', 'Location', 'Start Time', 'End Time', 'All Day Event', 'Id'];
var fields = titleRow.map(function(entry) {return entry.toLowerCase().replace(/ /g, '');});

// Adds the custom menu to the active spreadsheet.
function onOpen() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var menuEntries = [
    {
      name: "Update from Calendar",
      functionName: "syncFromCalendar"
    }, {
      name: "Update to Calendar",
      functionName: "syncToCalendar"
    }
  ];
  spreadsheet.addMenu('Calendar Sync', menuEntries);
}

// Creates a mapping array between spreadsheet column and event field name
function createIdxMap(row) {
  var idxMap = [];
  for (var idx = 0; idx < row.length; idx++) {
    var fieldFromHdr = row[idx].toLowerCase().replace(/ /g, '');
    if (fields.indexOf(fieldFromHdr) > -1) {
      idxMap.push(fieldFromHdr);
    } else {
      idxMap.push(null);
    }
  }
  return idxMap;
}

// Converts a spreadsheet row into an object containing event-related fields
function reformatEvent(row, idxMap) {
  return row.reduce(function(event, value, idx) {
    if (idxMap[idx] != null) {
      event[idxMap[idx]] = value;
    }
    return event;
  }, {});
}

// Converts calendar event into spreadsheet data row
function calEventToSheet(calEvent, idxMap, dataRow) {
  convertedEvent = {
    'id': calEvent.getId(),
    'title': calEvent.getTitle(),
    'description': calEvent.getDescription(),
    'location': calEvent.getLocation()
  };
  if (calEvent.isAllDayEvent()) {
    convertedEvent.alldayevent = true;
    convertedEvent.starttime = calEvent.getAllDayStartDate();
    convertedEvent.endtime = '';
  } else {
    convertedEvent.alldayevent = false
    convertedEvent.starttime = calEvent.getStartTime();
    convertedEvent.endtime = calEvent.getEndTime();
  }

  for (var idx = 0; idx < idxMap.length; idx++) {
    if (idxMap[idx] !== null) {
      dataRow[idx] = convertedEvent[idxMap[idx]];
    }
  }
}

// Tests whether calendar event matches spreadsheet event
function eventMatches(cev, sev) {
  return cev.getTitle() == sev.title &&
    cev.getDescription() == sev.description &&
      cev.getStartTime().getTime() == sev.starttime.getTime() &&
        (!sev.endtime || cev.getEndTime().getTime() == sev.endtime.getTime()) &&
          cev.isAllDayEvent() == sev.alldayevent &&
            cev.getLocation() == sev.location;
}

// Determine whether required fields are missing
function fieldsMissing(idxMap) {
  return ['id', 'title', 'starttime', 'endtime', 'alldayevent'].some(function(val) {
    return idxMap.indexOf(val) < 0;
  });
}

// Set up formats and hide ID column for empty spreadsheet
function setUpSheet(sheet, fields) {
  sheet.getRange(1, fields.indexOf('starttime') + 1, 999).setNumberFormat('M/d/yyyy H:mm');
  sheet.getRange(1, fields.indexOf('endtime') + 1, 999).setNumberFormat('M/d/yyyy H:mm');
  sheet.hideColumns(fields.indexOf('id') + 1);
}

// Display error alert
function errorAlert(msg, evt, ridx) {
  var ui = SpreadsheetApp.getUi();
  if (evt) {
    ui.alert('Skipping row: ' + msg + ' in event "' + evt.title + '", row ' + (ridx + 1));
  } else {
    ui.alert(msg);
  }
}

// Get active spreadsheet's calendarId
function getCalendarId() {
  var sheetName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();

  return calendarIds[sheetName];
}

// Synchronize from calendar to spreadsheet.
function syncFromCalendar() {
  // Get calendar and events
  var calendarId = getCalendarId();
  var calendar = CalendarApp.getCalendarById(calendarId);
  var calEvents = calendar.getEvents(new Date('1/1/1970'), new Date('1/1/2030'));

  // Get spreadsheet and data
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();
  var range = sheet.getDataRange();
  var data = range.getValues();
  var eventFound = new Array(data.length);

  // Check if spreadsheet is empty and add a title row
  if (data.length < 1) {
    data.push(titleRow.slice());
    setUpSheet(sheet, fields);
  }

  if (data.length == 1 && data[0].length == 1 && data[0][0] === '') {
    data[0] = titleRow.slice();
    setUpSheet(sheet, fields);
  }

  // Map spreadsheet headers to indices
  var idxMap = createIdxMap(data[0]);
  var idIdx = idxMap.indexOf('id');

  // Verify header has all required fields
  if (fieldsMissing(idxMap)) {
    errorAlert('Spreadsheet must have Title, Start Time, End Time, All Day Event, and Id columns');
    return;
  }

  // Array of IDs in the spreadsheet
  var sheetEventIds = data.slice(1).map(function(row) {return row[idIdx];});

  // Loop through calendar events
  for (var cidx = 0; cidx < calEvents.length; cidx++) {
    var calEvent = calEvents[cidx];
    var calEventId = calEvent.getId();

    var ridx = sheetEventIds.indexOf(calEventId) + 1;
    if (ridx < 1) {
      // Event not found, create it
      ridx = data.length;
      var newRow = [];
      var rowSize = idxMap.length;
      while (rowSize--) newRow.push('');
      data.push(newRow);
    } else {
      eventFound[ridx] = true;
    }
    // Update event in spreadsheet data
    calEventToSheet(calEvent, idxMap, data[ridx]);

  }

  // Remove any data rows not found in the calendar
  var rowsDeleted = 0;
  for (var idx = eventFound.length - 1; idx > 0; idx--) {
    if (!eventFound[idx]) {
      data.splice(idx, 1);
      rowsDeleted++;
    }
  }

  // Save spreadsheet changes
  range = sheet.getRange(1, 1, data.length, data[0].length);
  range.setValues(data);
  if (rowsDeleted > 0) {
    sheet.deleteRows(data.length + 1, rowsDeleted);
  }
}

// Synchronize from spreadsheet to calendar.
function syncToCalendar() {
  // Get calendar and events
  var calendarId = getCalendarId();
  var calendar = CalendarApp.getCalendarById(calendarId);
  var calEvents = calendar.getEvents(new Date('1/1/1970'), new Date('1/1/2030'));
  var calEventIds = calEvents.map(function(val) {return val.getId()});

  // Get spreadsheet and data
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet();
  var range = sheet.getDataRange();
  var data = range.getValues();
  if (data.length < 2) {
    errorAlert('Spreadsheet must have a title row and at least one data row');
    return;
  }

  // Map headers to indices
  var idxMap = createIdxMap(data[0]);
  var idIdx = idxMap.indexOf('id');
  var idRange = range.offset(0, idIdx, data.length, 1);
  var idData = idRange.getValues()

  // Verify header has all required fields
  if (fieldsMissing(idxMap)) {
    errorAlert('Spreadsheet must have Title, Start Time, End Time, All Day Event, and Id columns');
    return;
  }

  // Loop through spreadsheet rows
  var numAdds = 0;
  var numUpdated = 0;
  var changesMade = false;
  for (var ridx = 1; ridx < data.length; ridx++) {
    var sheetEvent = reformatEvent(data[ridx], idxMap);

    // Do some error checking first
    if (!sheetEvent.title) {
      errorAlert('must have title', sheetEvent, ridx);
      continue;
    }
    if (!(sheetEvent.starttime instanceof Date)) {
      errorAlert('start time must be a date/time', sheetEvent, ridx);
      continue;
    }
    if (!sheetEvent.alldayevent && !(sheetEvent.endtime instanceof Date)) {
      errorAlert('end time must be a date/time', sheetEvent, ridx);
      continue;
    }
    if (!sheetEvent.alldayevent && sheetEvent.endtime < sheetEvent.starttime) {
      errorAlert('end time must be after start time for event', sheetEvent, ridx);
      continue;
    }

    // Determine if spreadsheet event is already in calendar and matches
    var addEvent = true;
    if (sheetEvent.id) {
      var eventIdx = calEventIds.indexOf(sheetEvent.id);
      if (eventIdx >= 0) {
        calEventIds[eventIdx] = null;  // Prevents removing event below
        var calEvent = calEvents[eventIdx];
        if (eventMatches(calEvent, sheetEvent)) {
          addEvent = false;
        } else {
          // Delete and re-create event. It's easier than updating in place.
          calEvent.deleteEvent();
          numUpdated++;
        }
      }
    }
    if (addEvent) {
      var newEvent;
      if (sheetEvent.alldayevent) {
        newEvent = calendar.createAllDayEvent(sheetEvent.title, sheetEvent.starttime, sheetEvent);
      } else {
        newEvent = calendar.createEvent(sheetEvent.title, sheetEvent.starttime, sheetEvent.endtime, sheetEvent);
      }
      // Put event ID back into spreadsheet
      idData[ridx][0] = newEvent.getId();
      changesMade = true;

      // Updating too many calendar events in a short time interval triggers an error. Still experimenting with
      // the exact values to use here, but this works for updating about 40 events.
      numAdds++;
      if (numAdds > 10) {
        Utilities.sleep(75);
      }
    }
  }

  // Save spreadsheet changes
  if (changesMade) {
    idRange.setValues(idData);
  }

  // Remove any calendar events not found in the spreadsheet
  var numToRemove = calEventIds.reduce(function(prevVal, curVal) {
    if (curVal !== null) {
      prevVal++;
    }
    return prevVal;
  }, 0);
  if (numToRemove > 0) {
    var ui = SpreadsheetApp.getUi();
    var response = ui.Button.YES;
    if (numToRemove > numUpdated) {
      response = ui.alert('Delete ' + numToRemove + ' calendar event(s) not found in spreadsheet?',
          ui.ButtonSet.YES_NO);
    }
    if (response == ui.Button.YES) {
      calEventIds.forEach(function(id, idx) {
        if (id != null) {
          calEvents[idx].deleteEvent();
          Utilities.sleep(20);
        }
      });
    }
  }
}
