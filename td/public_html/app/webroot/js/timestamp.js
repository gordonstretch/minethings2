// from http://php+net/manual/en/function+time+php
function Timeago(referencedate){    // Measureby can be: s, m, h, d, M or y
	timepointer='';
	measureby='';
	autotext=true;
	
	d = new Date();
	if(timepointer === '') timepointer = d.getTime()/1000 + timeOffset;
	Raw = timepointer-referencedate;    // Raw time difference
	Clean = Math.abs(Raw);
	calcNum = Array(Array('s', 60), Array('m', 60*60), Array('h', 48*60*60), Array('d', 60*60*60*24), Array('M', 18*60*60*24*30), Array('y', 6000*60*60*24*365));    // Used for calculating
	calc = Array(Array(1, 'second'), Array(60, 'minute'), Array(60*60, 'hour'), Array(60*60*24, 'day'), Array(60*60*24*30, 'month'), Array(60*60*24*365, 'year'));    // Used for units and determining actual differences per unit (there probably is a more efficient way to do this)
   
	if(measureby == ''){    // Only use if nothing is referenced in the function parameters
		usemeasure = 's';    // Default unit
		measurekey = 0;
   
		for(i=0; i<calcNum.length; i++){    // Loop through calcNum until we find a low enough unit
			if(Clean <= calcNum[i][1]){        // Checks to see if the Raw is less than the unit, uses calcNum b/c system is based on seconds being 60
				usemeasure = calcNum[i][0];    // The if statement okayed the proposed unit, we will use this friendly key to output the time left
				measurekey = i;
				break; 
			}       
		}
	}else{
		usemeasure = measureby;                // Used if a unit is provided
	}
   
	datedifference = (Clean/calc[measurekey][0]).toFixed();    // Rounded date difference
   
	if(autotext==true){
		if(Raw < 0){
			prospect = ' from now';
		}else{
			prospect = ' ago';
		}
	}
   
	if(referencedate != 0){        // Check to make sure a date in the past was supplied
		if(datedifference == 1){    // Checks for grammar (plural/singular)
			return datedifference + ' ' + calc[measurekey][1] + ' ' + prospect;
		}else{
			return datedifference + ' ' + calc[measurekey][1] + 's ' + prospect;
		}
	}else{
		return 'No input time referenced+';
	}
}


function UpdateTimestamp(tsid) {
	if (timestamp > 0)
	{
		ts = Timeago(timestamp);

		$(tsid).innerHTML = ts;
	}
}

	
function PrintTimestamp(tsid) {
	document.write("<span id="+tsid+">...</span>");
	UpdateTimestamp(tsid);
}
