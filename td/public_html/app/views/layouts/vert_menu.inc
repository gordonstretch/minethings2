
	<!--Left Navigation Column-->
	<nav id="left">
	
		<ul id="navlist">

			<? if ($debug and (isset($peakMemory) or isset($processingTime))) { 
				echo '<li style="color:white">';
				if (isset($peakMemory))
					echo $peakMemory."mb ";
				if (isset($processingTime))
					echo $processingTime."s ";
				echo "<li>"; } ?>
	
			<?
			$findingText = 'Mines';
			if (isset($hasRipeMine) and $hasRipeMine)
				$findingText = ">>> ".$findingText;
			$factoryText = 'Factories';
			if (isset($hasRipeFactory) and $hasRipeFactory)
				$factoryText = '>>> '.$factoryText;
			$bankingLinkName = 'Banking'.((isset($bankingInboxCount) and $bankingInboxCount) ? " (<div id=\"BankingInboxCountDiv\" style=\"display:inline\">$bankingInboxCount</div>)" : ""); 
			$messageLinkName = 'Messages';
			if (isset($numUnreadMessages) and $numUnreadMessages > 0)
				$messageLinkName.=" ($numUnreadMessages)";
			?>
			
			<li><div id="FindingsDiv"><? echo $html->link($findingText, '/mines/check_mines', array('id' => 'MinesLink')); ?></div></li>
			
			<? if ($fullVert): ?><li id="active"><? echo $html->link('Things', $loggedIn ? '/miners/things/'.$minerName : ''); ?></li><? endif; ?>
			
			<? if ($fullVert): ?><li><? echo $html->link('Gadgets', '/gadgets'); ?></li><? endif; ?>
			
			<li><? echo $html->link('Vehicles', '/vehicles');?></li>
			
			<? if ($fullVert): ?><li><? echo $html->link('Ships', '/ships'); ?></li><? endif; ?>
			
			<? if ($fullVert): ?><li><? echo $html->link('Aircraft', '/aircraft'); ?></li><? endif; ?>
			
			<? if ($fullVert): ?><li><? echo $html->link($bankingLinkName, $myBank ? '/banks/view/'.$minerName : '/banks/active', array('escape' => false)); ?></li><? endif; ?>
			
			<? if ($fullVert): ?><li><div id="FactoriesDiv"><? echo $html->link($factoryText, '/factories'); ?></div></li><? endif; ?>
			
			<? if ($fullVert): ?><li><? echo $html->link('Machines', '/machines'); ?></li><? endif; ?>
			
			<? if ($showProfession): ?><li><? echo $html->link('Profession', '/miners/profession'); ?></li><? endif; ?>

			<li><div id="MessagesDiv" ><? echo $html->link($messageLinkName, '/messages/list_all'); ?> </div></li>

			<li><? echo $html->link('Account', '/miners/account'); ?></li>
	
			<? if( $isAdministrator ): ?>
			<li><? echo $html->link('Admin', '/admins/'); ?></li>
			<? endif ?>
	
		</ul>
		<p style="text-align:right; color:white; padding:0px; margin:8px;"><? echo date('m-d H:i'); ?></p>
	</nav>
	<!--End Left Navigation Column-->

