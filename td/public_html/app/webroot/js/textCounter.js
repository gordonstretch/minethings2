
function OnChar(text, maxChars, remChars) {	

	// remove any special characters
	if (remChars)
	{
		newValue = text.value.replace(/<|>|'|"|%|&|\(|\)|-|\+|\\n/g, "");
		if (newValue != text.value) // conditional prevents text box from resetting with every key
			text.value = newValue
	}

	var charsLeft = maxChars - text.value.length;
	if (charsLeft < 0) {
		text.value = text.value.substring(0, maxChars);
		charsLeft = 0;
	}


	tc = document.getElementById('textCounter');
	if (tc)
		tc.innerHTML = charsLeft;
}

	
function PrintCharacterCounter(counterStart) {
	document.write("<span id='textCounter'>"+counterStart+"</span>");
}
