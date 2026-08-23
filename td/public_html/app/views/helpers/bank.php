<?

class BankHelper extends AppHelper
{
	var $helpers = array('Html', 'Ajax', 'Form');

	function ActionForm($id, $actionLabel, $action, $updateDiv, $inputs='')
	{
		#$form = '<div style="display:inline; float:left; padding-left:10px;">';
		$form = $this->Html->link($actionLabel, '#', array('onclick' => '$("'.$actionLabel.$id.'Form").toggle(); return false;'));
		$form.= '<div id="'.$actionLabel.$id.'Form" style="display:none">';
		$form.= $this->Ajax->form($action, 'post', array(
			'model' => 'BankingApplication', 
			'indicator' => 'LoadingDiv',
			'update' => array($updateDiv, 'BankingInboxCountDiv')));
		//$form.= $this->Form->create('', array('action' => $action));
		$form.= $inputs;
		$form.= $this->Form->end($actionLabel);
		$form.= '</div>';
		#$form.= '</div>';
		return $form;
	}

	function BankingApplicationTable($applications, $forBank, $deposits, $updateDiv, $showActive=1)
	{
		$actionArgs = "$forBank/$deposits/$updateDiv";
		
		echo $this->Ajax->link('Show '.($showActive?'Deleted':'Active'),
				array('action' => 'js_show_applications/'.$actionArgs."/".($showActive?'0':'1') ), 
				array('update' => $updateDiv, 'indicator' => 'LoadingDiv'));			
		
		if (count($applications))
		{
			?><table class="bank"><?			
			$headers = array('Principal', 'Interest', 'Duration', );
			if ($deposits)
			{
				$headers[] = 'Return';
				$headers[] = 'Interest Earned';
			}
			else
				$headers = array_merge($headers, array('Payments', 'Payment', 'Cost'));
		
			if ($forBank)
				$headers[] = 'Customer';
			else
				$headers[] = 'Bank';
			$headers[] = 'Created';
			echo $this->Html->tableHeaders($headers);

			foreach($applications as $application)
			{
				$a = $application['BankingApplication'];
				
				if ($forBank)
				{
					if ($a['accepted_at_another_bank'])
						$note = 'Accepted at another bank';
					else if ($a['rejected_by_customer'])
						$note = 'Rejected by customer';
					else if ($a['rejected_by_bank'])
						$note = 'Rejected by you';
					else if ($a['in_bank_inbox'])
						$note = 'Awaiting your response';
					else 
						$note = 'Awaiting customer\'s response';
				}
				else
				{
					if ($a['accepted_at_another_bank'])
						$note = 'Accepted at another bank';
					else if ($a['rejected_by_bank'])
						$note = 'Rejected by bank';
					else if ($a['rejected_by_customer'])
						$note = 'Rejected by you';
					else if (!$a['in_bank_inbox'])
						$note = 'Awaiting your response';
					else 
						$note = 'Awaiting bank\'s response';
				}
	
				
				$actions = array();
				$idInput = $this->Form->input('BankingApplication.id', array('type' => 'hidden', 'value' => $a['id']));
				$option = array('style' => 'vertical-align:top;');
				$active = (!$a['rejected_by_bank'] and !$a['rejected_by_customer'] and !$a['accepted_at_another_bank']);
				if (($a['in_bank_inbox'] == $forBank) and $active)
				{
					$option['style'].= 'font-weight:bold;';
					$actions[]= $this->ActionForm($a['id'], 'Approve', "js_approve_application/$actionArgs", $updateDiv, $idInput);
					$id = $a['id'];
					$onKeyUp = $deposits ? 
								"UpdateDepositInfo($(\"Principle$id\").innerHTML, $(\"Duration$id\").value, $(\"Interest$id\").value, $(\"Return$id\"), $(\"InterestEarned$id\") );" 
								: "UpdateLoanInfo($(\"Principle$id\").innerHTML, $(\"Duration$id\").value, $(\"Interest$id\").value, $(\"Payment$id\"), $(\"Payments$id\"), $(\"Cost$id\"));";
					$actions[]= $this->ActionForm($a['id'], 'Modify', "js_modify_application/$actionArgs", $updateDiv, 
						$idInput
						.$this->Form->input('BankingApplication.interest', array(
							'id' => 'Interest'.$a['id'], 
							'value' => $a['interest'], 
							'style' => 'width:40px',
							'onkeyup' => $onKeyUp))
						.$this->Form->input('BankingApplication.duration', array(
							'id' => 'Duration'.$a['id'], 
							'value' => $a['duration'], 
							'style' => 'width:40px',
							'onkeyup' => $onKeyUp))
						);
				}
				if (!$active)
				{
					$actions[] = $this->Ajax->link('Delete', 
						array('action' => "js_delete_application/".$a['id']."/$actionArgs"),
						array('update' => $updateDiv, 'indicator' => 'LoadingDiv'));
					//$actions[]= $this->ActionForm($a['id'], 'Delete', "js_delete_application/$actionArgs", $updateDiv, $idInput);
					
					if ($forBank)
					{
						if ($application['blocked'])
							$actions[] = '[blocked]';
						else
							$actions[]= $this->ActionForm($a['id'], 'Block PMs & Apps', "js_block_applications/$actionArgs/".$a['customer_id'], $updateDiv, $idInput);
					}
				}
				else
					$actions[]= $this->ActionForm($a['id'], 'Reject', "js_reject_application/$actionArgs", $updateDiv, $idInput);				
					
		
				$cells = array(		
					'<div id="Principle'.$a['id'].'" style="display:inline">'.$a['principle'].'</div>g', 
					$a['interest'].'%',  // Interest element is in the Modify form
					$a['duration'].'d', 
					);
				if ($deposits)
				{
					$cells[] = '<div id="Return'.$a['id'].'" style="display:inline">'.$a['return'].'</div>g';
					$cells[] = '<div id="InterestEarned'.$a['id'].'" style="display:inline">'.$a['interestEarned'].'</div>g';
				}
				else					
				{
					$cells = array_merge($cells, array(
						'<div id="Payments'.$a['id'].'" style="display:inline">'.$a['payments'].'</div>', 
						'<div id="Payment'.$a['id'].'" style="display:inline">'.$a['payment'].'</div>g', 
						'<div id="Cost'.$a['id'].'" style="display:inline">'.$a['cost'].'</div>g', 
						));
				}
				if ($forBank)
				{
					$customer = $this->Html->link(
						$application['Customer']['name'], 
						'/miners/profile/'.$application['Customer']['name']);
					if ($active)
						$customer.= ' '.$this->Html->link(
							'get report',
							'/banks/report/'.$application['Customer']['name']);
					$cells[] = $customer;
				}
				else
					$cells[] = $this->Html->link($a['bankerName'], '/banks/view/'.$a['bankerName']);
				$cells[] = date('m/d', $a['created_time']);
				$cells[] = $note;
				$cells = array_merge($cells, $actions);

				echo $this->Html->tableCells($cells, $option, null, false, false);
				
				if (!$deposits)
					echo $this->Html->tableCells(array(
						array('', array('reason: '.$a['reason'], array('colspan' => '100%')))
						));
			}
			?></table><?
		}
		else
			echo '<p>No applications</p>';
	}
	
	

	function BankingAccountsTable($accounts, $forBank, $deposits, $updateDiv, $showActive=true)
	{
		$actionArgs = "$forBank/$deposits/$updateDiv";
		echo $this->Ajax->link('Show '.($showActive?'Deleted':'Active'),
				array('action' => 'js_show_accounts/'.$actionArgs."/".($showActive?'0':'1') ), 
				array('update' => $updateDiv, 'indicator' => 'LoadingDiv'));			

		if (count($accounts))
		{
			?><table class="bank"><?
			$headers = array('Created', $forBank ? 'Customer' : 'Bank', 'Principal', 'Interest', 'Duration', 'Balance', 'Paid', 'Next Payment', 'Due');
			
			echo $this->Html->tableHeaders($headers);
			
			foreach($accounts as $account)
			{
				$a = $account['BankingAccount'];
				$id = $a['id'];
				
				$dueDate = date('m-d H:i', $a['nextPaymentDueTime']);
				if ($a['nextPaymentDueTime'] < time() and $a['balance'] > 0)
					$dueDate = '<span style="color:red">'.$dueDate.'</span>';
					
				$showPayments = $this->Ajax->link('Show Payments', 
					array('action' => 'js_show_payments/'.$id), 
					array('update' => 'ShowPaymentsDiv'.$id, 'indicator' => 'LoadingDiv'));
					
				if ($forBank)
					$other = $this->Html->link(
						$account['Customer']['name'], 
						'/miners/profile/'.$account['Customer']['name']);
				else
					$other = $this->Html->link($a['bankerName'], '/banks/view/'.$a['bankerName']);
					
				$cells = array(
					date('m-d', $a['created_time']), 
					$other,
					$a['principle'].'g', 
					$a['interest'].'%', 
					$a['duration'], 
					max(0, ceil($a['balance'])).'g', 
					$a['paid'].'g',
					max(0, $a['nextPayment']).'g',
					$dueDate,
					);
				
				if ($forBank == $deposits and ($a['balance'] > 0))
				{
					$form = $this->Html->link('Make Payment', '#', array('onclick' => '$("MakePaymentForm'.$id.'").toggle(); return false;'));
					$form.= '<div id="MakePaymentForm'.$id.'" style="display:none">';
					$form.= $this->Ajax->form("js_make_payment/$actionArgs", 'post', array(
						'model' => 'BankingAccount', 
						'indicator' => 'LoadingDiv',
						'update' => $updateDiv));
					//$form.= $this->Form->create('', array('action' => 'js_make_payment'));
					$form.= $this->Form->input('BankingAccount.id', array('type' => 'hidden', 'value' => $id));
					$form.= $this->Form->input('BankingAccount.gold');
					$form.= $this->Form->end('Make Payment');
					$form.= '</div>';
					$cells[] = $form;
				}
					
				if ($a['balance'] <= 0)
					$cells[] = $this->Ajax->link('Delete', 
						array('action' => "js_dismiss_account/$id/$actionArgs"),
						array('update' => $updateDiv, 'indicator' => 'LoadingDiv'));

				$cells[] = $showPayments;
								
				echo $this->Html->tableCells($cells);
				
				echo $this->Html->tableCells(array(array(
					'',
					array('<div id="ShowPaymentsDiv'.$id.'"></div>', array('colspan' => 0, 'style' => 'padding:0px')),
					)));
					
			}
			?></table><?
		}
		else
		{
			$noun = $deposits ? "deposits" : "loans";
			echo "<p>No $noun</p>";
		}
	}
}
?>