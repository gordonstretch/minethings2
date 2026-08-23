<?
echo $ajax->div($updateDiv);
if (isset($message))
	echo "<p>$message</p>";
echo $bank->BankingApplicationTable($bankingApplications, $forBank, $deposits, $updateDiv, $showActive);
echo $ajax->divEnd($updateDiv);

echo $ajax->div('BankingInboxCountDiv');
echo $bankingInboxCount;
echo $ajax->divEnd('BankingInboxCountDiv');
?>