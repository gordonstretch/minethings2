<? echo $html->css('filtergrid'); ?>
<? echo $javascript->link('tablefilter/tablefilter_all'); ?>
<? echo $javascript->link('tablefilter/sortabletable'); ?>

<?
function Tooltip($Html, $text, $tip)
{
	return $text .' '. $Html->link('?', '#', array('onclick' => 'return false;', 'title' => $tip));
}
?>

<div id=fullcenter>

<? include 'tabs.inc' ?>

<div style="float:right">
	<? echo $html->link($customerName."'s profile", '/miners/profile/'.$customerName); ?>
</div>

<?
echo "<h3>Loans Borrowed by $customerName</h3>";
?>


<? if ($accounts === false): ?>
<p>Access denied</p>
<? elseif (!count($accounts)): ?>
<p>None</p>
<? else: ?>
	<p>
	Total principal: <? echo $summary['totalPrinciple']; ?>, 
	Average interest: <? echo round($summary['avgInterest'], 1); ?>,
	Late Days: <? echo $summary['latePayments']; ?>,
	Defaults: <? echo $summary['defaults']; ?>
	</p>
	
	<table id="loanTable" class="bank" >
	<thead >
	<? 
	$headers = array(
		'Created',
		'Principal', 
		'Interest', 
		'Duration', 
		'Bank',
		Tooltip($html, 'Lates', 'Total late days incurred by the borrower on this account.  Increments once per day while payment is overdue.'),
		);
	echo $html->tableHeaders($headers);  
	?>
	</thead>
	<?
	foreach($accounts as $a)
	{
		$cells = array(
			date('Y-m-d', $a['BankingAccount']['created_time']),
			$a['BankingAccount']['principle'],
			round($a['BankingAccount']['interest'], 2),
			$a['BankingAccount']['duration'],
			$html->link($a['bankName'], '/banks/view/'.$a['bankerName']),
			$a['BankingAccount']['late_payments'],
			);
			
		echo $html->tableCells(array($cells));
	}
	?>
	</table>
	<div id="PagingDiv"></div>
	

<? endif; ?>


<? 
$types = "'ymddate', 'us', 'us', 'us', 'String', 'us'"; 
?>
<script language="javascript" type="text/javascript">  
	var filters = {  
		paging: true,
		paging_length: 20,
		paging_target_id: 'PagingDiv',
		default_date_type: "YMD",
		col_4: "select", 
		sort: true,
		sort_config: {
			sort_types:[<? echo $types; ?>],
		},
		sort_images_path: '/img/'
	}  
	var loansTf = setFilterGrid("loanTable",1,filters);  
</script>  


<? if ($accounts !== false): ?>
	<p>Gold balance: <? echo $market->commatize($gold); ?>g</p>
	<p>Join date: <? echo date('Y-m-d', strtotime($joinDate)); ?></p>
	<p>Outstanding Banking Assets: <? echo $market->commatize(round($assets)); ?>g</p>
	<p>Outstanding Banking Liabilities: <? echo $market->commatize(round($liabilities)); ?>g</p>
	
<? endif; ?>

<? 
if ($customerName == $minerName)
	echo '<p>This report is visible to any bank to which you apply for a loan or deposit.</p>';
else
	echo '<p>'.$html->link('Click here to see your report', '/banks/report/'.$minerName).'</p>'; 
?>

</div>