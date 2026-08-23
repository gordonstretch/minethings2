<? echo $javascript->link('banking'); ?>

<style type="text/css">
table{
	font-size: 12px;
}
td{
	padding:4px;
}
</style>
<div id=fullcenter>
<? include 'tabs.inc' ?>


<?
echo $html->link('Apply for a loan', 'loan_application')
.'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'.
$html->link('Apply for a deposit', 'deposit_application')
.'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'.
$html->link('Your credit report', 'report/'.$minerName);
?>

<h1>Loan Applications</h1>	
<div id="LoanApplicationsDiv">
<? echo $bank->BankingApplicationTable($loanApplications, 0, 0, 'LoanApplicationsDiv'); ?>
</div>

<h1>Deposit Applications</h1>	
<div id="DepositApplicationsDiv">
<? echo $bank->BankingApplicationTable($depositApplications, 0, 1, 'DepositApplicationsDiv'); ?>
</div>


<h1>Loans</h2>
<div id="LoansDiv">
<? echo $bank->BankingAccountsTable($loans, 0, 0, 'LoansDiv'); ?>
</div>

<h1>Deposits</h2>
<div id="DepositsDiv">
<? echo $bank->BankingAccountsTable($deposits, 0, 1, 'DepositsDiv'); ?>
</div>

</div>
