function UpdateLoanInfo(principle, duration, interest, paymentElement, paymentsElement, costElement)
{
	//suffix = typeof(suffix) != 'undefined' ? suffix : "";
	//principle = $("Principle"+suffix).value;
	//duration = $("Duration"+suffix).value;
	//interest = $("Interest"+suffix).value;

	daily = interest/100.0/30.0 + 1.0;
	firstPaymentDay = Math.min(duration, duration % 7 + 7);
	payments = (duration - firstPaymentDay) / 7 + 1;
	payment = principle * Math.pow(daily, duration) / ((1 - Math.pow(daily, (7*payments)))/(1 - Math.pow(daily, 7)));
	payment = Math.ceil(payment);
	cost = payment*payments - principle;

	
	paymentElement.update(payment);
	paymentsElement.update(payments);
	costElement.update(cost);
	
}

function UpdateDepositInfo(principle, duration, interest, returnElement, interestEarnedElement)
{
	daily = interest/100.0/30.0 + 1.0;
	depositReturn = principle * Math.pow(daily, duration);
	depositReturn = Math.ceil(depositReturn);
	returnElement.update(depositReturn);
	interestEarnedElement.update(depositReturn - principle);
}
