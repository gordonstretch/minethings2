<? echo $javascript->link('banking'); ?>
<? echo $html->css('filtergrid'); ?>
<? echo $javascript->link('tablefilter/tablefilter_all'); ?>
<? echo $javascript->link('tablefilter/sortabletable'); ?>

<div id=fullcenter>

<? include 'tabs.inc' ?>

<div style="float:right">
	<? echo $html->link($miner['Miner']['name']."'s profile", '/miners/profile/'.$miner['Miner']['name']); ?>
</div>

<? if ($miner): ?>
	<h1>Bank of <?echo $miner['Miner']['name'];?></h1>
	<p><? echo htmlspecialchars($miner['Bank']['description']); ?> 
	<? if ($isOwner): 
		echo $html->link('edit description', '#', array('onclick' => '$("EditForm").show(); return false;'));  ?>
		<div id="EditForm" style="display:none">
		<?
		echo $form->create('', array('action' => 'view/'.$miner['Miner']['name']));	
		echo $form->input('Bank.description', array('type' => 'textarea'));
		echo $form->end('Save changes');
		?>
		</div>
	<? endif; ?>
	<p>
	Total past deposits: <? echo $market->commatize($summary['totalPrinciple']); ?>g, 
	Late Days: <? echo $summary['latePayments']; ?>,
	Defaults: <? echo $summary['defaults']; ?>
	</p>
	<p>Top Depositors: 
		<? 
		if (!count($depositors)) echo '[none]'; 
		$names = array_keys($depositors);
		foreach($names as &$n)
			$n = $html->link($n, '/miners/profile/'.$n);
		unset($n);
		echo join(', ', $names); 
		?>
	</p>
	</p>
	

	<? if (isset($loanApplications)): ?>
		<h1>Loan Applications</h1>	
		<div id="LoanApplicationsDiv">
		<? echo $bank->BankingApplicationTable($loanApplications, 1, 0, 'LoanApplicationsDiv'); ?>
		</div>

		<h1>Deposit Applications</h1>	
		<p><b>Warning:</b> <? echo $html->link('Rule 1.d', '/miners/help/#Rules'); ?> applies to all banking accounts, especially long-term deposits.</p>
		<div id="DepositApplicationsDiv">
		<? echo $bank->BankingApplicationTable($depositApplications, 1, 1, 'DepositApplicationsDiv'); ?>
		</div>			

		<h1>Loans</h2>
		<div id="LoansDiv">
		<? echo $bank->BankingAccountsTable($loans, 1, 0, 'LoansDiv'); ?>
		</div>

		<h1>Deposits</h2>
		<div id="DepositsDiv">
		<? echo $bank->BankingAccountsTable($deposits, 1, 1, 'DepositsDiv'); ?>
		</div>
		

	<? endif; ?>

<? else: ?>
	<p>No bank found</p>
<? endif; ?>


<? echo "<h1>Deposit History</h3>"; ?>

<? if (count($accounts)): ?>
	<table id="loanTable" class="bank">
	<thead >
	<? echo $html->tableHeaders(array('Created', 'Principal', 'Interest', 'Duration', 'Lates'));  ?>
	</thead>
	<?
	foreach($accounts as $a)
		echo $html->tableCells(array(array(
			date('Y-m-d', $a['BankingAccount']['created_time']),
			$a['BankingAccount']['principle'],
			round($a['BankingAccount']['interest'], 2),
			$a['BankingAccount']['duration'],
			$a['BankingAccount']['late_payments'],
			)));
	?>
	</table>
	<div id="PagingDiv"></div>
<? else: ?>
<p>No history</p>
<? endif; ?>

<script language="javascript" type="text/javascript">  
	var filters = {  
		paging: true,
		paging_length: 20,
		paging_target_id: 'PagingDiv',
		default_date_type: "YMD",
		sort: true,
		sort_config: {
			sort_types:['ymddate', 'us', 'us', 'us', 'us'],
		},
		sort_images_path: '/img/'
	}  
	var loansTf = setFilterGrid("loanTable",1,filters);  
</script>  

<?	
echo '<p>'.$html->link($miner['Miner']['name']."'s credit report", '/banks/report/'.$miner['Miner']['name']).'</p>'; 
?>


</div>