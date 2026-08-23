function onInputFocus(formInput, formLabel) {
	//if (formObject.defaultValue == formObject.value)
	//	formObject.value = "";
	formLabel.style.display = "none";
	formInput.focus();
}

function onInputBlur(formInput, formLabel) {
	if (formInput.value == "")
		formLabel.style.display = "inline";
}
